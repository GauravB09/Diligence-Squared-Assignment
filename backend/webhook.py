from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from schemas import TypeformWebhookPayload
from database import get_db, init_db
from models import UserSession, SurveyStatus
from interview import router as interview_router
from segment_logic import determine_segment
from datetime import datetime
import logging
import json

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="TypeForm Webhook Handler")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include interview router
app.include_router(interview_router)

# Initialize database on startup
@app.on_event("startup")
async def startup_event():
    """Initialize database tables on application startup."""
    init_db()
    logger.info("Database initialized")


@app.post("/webhook")
async def handle_typeform_webhook(request: Request, db: Session = Depends(get_db)):
    """
    Async endpoint to capture TypeForm webhook payload.
    Updates database with segment and status.
    Returns JSON with status = success.
    """
    try:
        # Parse the incoming JSON payload
        payload_data = await request.json()

        # Parse and validate the payload using Pydantic schema
        webhook_payload = TypeformWebhookPayload(**payload_data)
        user_id = webhook_payload.get_user_id()

        if not user_id:
            logger.warning("Invalid or Missing User ID. Ignoring.")
            return JSONResponse(
                status_code=200,
                content={"status": "ignored", "reason": "invalid_user_id"}
            )

        # Extract required fields
        form_response = webhook_payload.form_response
        survey_responses = webhook_payload.form_response.get_answers_with_questions()

        # Determine Segment using configuration-based logic
        segment, survey_status = determine_segment(survey_responses)

        # Check if user session already exists
        user_session = db.query(UserSession).filter(UserSession.user_id == user_id).first()

        # Parse submitted_at if available
        submitted_at = datetime.utcnow()
        if form_response.submitted_at:
            try:
                submitted_at = datetime.fromisoformat(form_response.submitted_at.replace('Z', '+00:00'))
            except Exception as e:
                logger.warning(f"Could not parse submitted_at: {e}")

        if user_session:
            # Update existing session
            user_session.survey_status = survey_status
            user_session.segment = segment
            user_session.submitted_at = submitted_at
        else:
            # Create new session
            user_session = UserSession(
                user_id=user_id,
                survey_status=survey_status,
                segment=segment,
                form_id=form_response.form_id,
                form_token=form_response.token,
                event_id=webhook_payload.event_id,
                submitted_at=submitted_at
            )
            db.add(user_session)

        # Commit changes to database
        db.commit()

        # Return success response
        return JSONResponse(
            status_code=200,
            content={"status": "success"}
        )

    except Exception as e:
        logger.error(f"Error processing webhook: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=400,
            detail=f"Error processing webhook: {str(e)}"
        )


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db
from models import UserSession
import uuid
import os
import requests
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/interview", tags=["interview"])

# Initialize ElevenLabs configuration
ELEVENLABS_AGENT_ID = os.getenv("ELEVENLABS_AGENT_ID", "agent_7501kbwz9masffca24mjt1x1pawb")
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")

if not ELEVENLABS_AGENT_ID:
    logger.warning("ELEVENLABS_AGENT_ID not set in environment variables")
if not ELEVENLABS_API_KEY:
    logger.warning("ELEVENLABS_API_KEY not set in environment variables")


class StartInterviewRequest(BaseModel):
    user_id: str


class StartInterviewResponse(BaseModel):
    conversation_id: str
    status: str
    message: str


class UpdateIdRequest(BaseModel):
    user_id: str
    conversation_id: str


@router.post("/start", response_model=StartInterviewResponse)
async def start_interview(
    request: StartInterviewRequest,
    db: Session = Depends(get_db)
):
    """
    Start an ElevenLabs AI agent conversation for a user.
    Creates/updates the user session with the conversation_id.
    """
    try:
        user_id = request.user_id

        if not user_id:
            raise HTTPException(
                status_code=400,
                detail="User ID is required"
            )

        if not ELEVENLABS_AGENT_ID:
            raise HTTPException(
                status_code=500,
                detail="ElevenLabs Agent ID is missing. Please set ELEVENLABS_AGENT_ID environment variable."
            )

        # Get or create user session
        user_session = db.query(UserSession).filter(
            UserSession.user_id == user_id
        ).first()

        if not user_session:
            raise HTTPException(
                status_code=404,
                detail=f"User session not found for user_id: {user_id}. Please complete the survey first."
            )

        # Generate a conversation_id for tracking
        # The ElevenLabs widget will handle the actual conversation creation
        # We generate a UUID to track this conversation session
        conversation_id = str(uuid.uuid4())
        logger.info(f"Generated conversation_id {conversation_id} for user {user_id}")

        # Update user session with conversation_id
        user_session.elevenlabs_conversation_id = conversation_id
        db.commit()
        db.refresh(user_session)

        logger.info(f"Updated user session {user_id} with conversation_id {conversation_id}")

        return StartInterviewResponse(
            conversation_id=conversation_id,
            status="success",
            message="Conversation started successfully"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting interview: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error starting interview: {str(e)}"
        )


@router.get("/session/{user_id}")
async def get_session_info(
    user_id: str,
    db: Session = Depends(get_db)
):
    """
    Get session information including conversation_id for a user.
    """
    print(f"Debug: Blehh")
    try:
        print(f"Debug: Getting session info for user_id: {user_id}")
        user_session = db.query(UserSession).filter(
            UserSession.user_id == user_id
        ).first()

        print(f"Debug: User session found: {user_session}")

        if not user_session:
            raise HTTPException(
                status_code=404,
                detail=f"User session not found for user_id: {user_id}"
            )

        status_val = "pending"
        if user_session.survey_status:
            if hasattr(user_session.survey_status, "value"):
                status_val = user_session.survey_status.value
            else:
                status_val = str(user_session.survey_status)

        print(f"Debug: User session status: {user_session.survey_status}")
        print(f"Debug: User session status value: {user_session.survey_status.value if hasattr(user_session.survey_status, 'value') else str(user_session.survey_status)}")

        segment_val = user_session.segment if user_session.segment else "Terminated"
        print(f"Debug: User session segment: {user_session.segment}")
        print(f"Debug: User session segment value: {user_session.segment if user_session.segment else 'Terminated'}")

        print(f"API RESPONSE -> ID: {user_id}, Status: {status_val}, Segment: {segment_val}")

        return {
            "user_id": user_session.user_id,
            "conversation_id": user_session.elevenlabs_conversation_id,
            "segment": user_session.segment or "Terminated",
            "survey_status": status_val,
            "created_at": user_session.created_at.isoformat() if user_session.created_at else None
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting session info: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error getting session info: {str(e)}"
        )

@router.post("/complete/{user_id}")
async def complete_interview(
    user_id: str,
    db: Session = Depends(get_db)
):
    """
    Mark interview as complete, fetch transcript from ElevenLabs, and store it.
    """
    if not ELEVENLABS_API_KEY:
        raise HTTPException(500, "Server misconfiguration: Missing ELEVENLABS_API_KEY")

    user_session = db.query(UserSession).filter(UserSession.user_id == user_id).first()
    if not user_session or not user_session.elevenlabs_conversation_id:
        raise HTTPException(404, "Active conversation not found")

    conversation_id = user_session.elevenlabs_conversation_id

    try:
        # 1. Fetch Transcript from ElevenLabs API
        url = f"https://api.elevenlabs.io/v1/convai/conversations/{conversation_id}"
        headers = {"xi-api-key": ELEVENLABS_API_KEY}

        response = requests.get(url, headers=headers)
        response.raise_for_status()

        data = response.json()

        # 2. Extract Transcript (the 'transcript' field contains the list of messages)
        # We format it as a readable string
        transcript_messages = data.get("transcript", [])
        formatted_transcript = ""
        for msg in transcript_messages:
            role = msg.get("role", "unknown")
            text = msg.get("message", "") # or "text" depending on API version
            formatted_transcript += f"[{role.upper()}]: {text}\n"

        # 3. Save to Database
        user_session.transcript = formatted_transcript
        # Optional: Update status if you want to lock the session
        # user_session.survey_status = "completed_interview"

        db.commit()

        return {
            "status": "success",
            "transcript": formatted_transcript
        }

    except requests.exceptions.RequestException as e:
        logger.error(f"ElevenLabs API Error: {str(e)}")
        raise HTTPException(502, f"Failed to retrieve transcript: {str(e)}")
    except Exception as e:
        logger.error(f"Error saving transcript: {str(e)}")
        raise HTTPException(500, f"Internal error: {str(e)}")


@router.post("/update-id")
async def update_conversation_id(
    request: UpdateIdRequest,
    db: Session = Depends(get_db)
):
    """
    Update the session with the real conversation_id from ElevenLabs SDK
    """
    user_session = db.query(UserSession).filter(UserSession.user_id == request.user_id).first()

    if not user_session:
        raise HTTPException(404, "User session not found")

    user_session.elevenlabs_conversation_id = request.conversation_id
    db.commit()

    return {"status": "updated"}
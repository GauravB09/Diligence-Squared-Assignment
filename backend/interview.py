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
ELEVENLABS_AGENT_ID = os.getenv("ELEVENLABS_AGENT_ID")
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

        if user_session.elevenlabs_conversation_id:
            try:
                # We await the completion logic to fetch & append the old transcript
                # to the database before the new session overwrites the ID.
                await complete_interview(user_id, db)
            except Exception:
                # If saving fails (e.g. API error), we proceed anyway so the user
                # isn't blocked from starting their new interview.
                pass

        # Generate a conversation_id for tracking
        # The ElevenLabs widget will handle the actual conversation creation
        # We generate a UUID to track this conversation session
        conversation_id = str(uuid.uuid4())

        # Update user session with conversation_id
        user_session.elevenlabs_conversation_id = conversation_id
        db.commit()
        db.refresh(user_session)

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
    try:
        user_session = db.query(UserSession).filter(
            UserSession.user_id == user_id
        ).first()

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

        return {
            "user_id": user_session.user_id,
            "conversation_id": user_session.elevenlabs_conversation_id,
            "segment": user_session.segment or "Terminated",
            "survey_status": status_val,
            "transcript": user_session.transcript,
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
    Mark interview as complete, fetch transcript from ElevenLabs, and store it in the database.
    """
    if not ELEVENLABS_API_KEY:
        raise HTTPException(500, "Server misconfiguration: Missing ELEVENLABS_API_KEY")

    user_session = db.query(UserSession).filter(UserSession.user_id == user_id).first()
    if not user_session:
        raise HTTPException(404, f"User session not found for user_id: {user_id}")

    if not user_session.elevenlabs_conversation_id:
        raise HTTPException(404, "No conversation ID found for this user session")

    conversation_id = user_session.elevenlabs_conversation_id

    try:
        # 1. Fetch Transcript from ElevenLabs API
        url = f"https://api.elevenlabs.io/v1/convai/conversations/{conversation_id}"
        headers = {"xi-api-key": ELEVENLABS_API_KEY}

        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()

        data = response.json()

        transcript_messages = data.get("transcript", [])
        # 2. Extract Transcript - handle different possible response structures
        formatted_transcript = ""

        if isinstance(transcript_messages, list) and len(transcript_messages) > 0:
            for msg in transcript_messages:
                if isinstance(msg, dict):
                    role = msg.get("role", "unknown")
                    text = msg.get("message") or msg.get("text") or ""
                    if text:
                        formatted_transcript += f"[{role.upper()}]: {text}\n"
                elif isinstance(msg, str):
                    formatted_transcript += f"{msg}\n"
        elif isinstance(transcript_messages, str):
            formatted_transcript = transcript_messages
        else:
            logger.warning(f"Unexpected transcript format. Response keys: {list(data.keys())}")

        # 3. Append to existing transcript (if any) and save to Database
        new_transcript = formatted_transcript.strip()
        existing_transcript = user_session.transcript or ""

        # If there's existing transcript, append the new one with a separator
        if existing_transcript and existing_transcript.strip():
            # Add a separator to distinguish between conversation sessions
            separator = "\n\n" + "="*80 + "\n"
            separator += f"--- Conversation Resumed ---\n"
            separator += "="*80 + "\n\n"
            combined_transcript = existing_transcript + separator + new_transcript
            user_session.transcript = combined_transcript
        else:
            # First transcript, just save it
            user_session.transcript = new_transcript

        # Commit the transaction
        db.commit()
        db.refresh(user_session)

        # Return the full accumulated transcript
        return {
            "status": "success",
            "transcript": user_session.transcript,  # Return the full accumulated transcript
            "new_transcript": new_transcript,  # Also return just the new portion
            "message": "Transcript saved successfully"
        }

    except requests.exceptions.HTTPError as e:
        error_detail = f"HTTP {e.response.status_code}: {e.response.text if hasattr(e, 'response') else str(e)}"
        logger.error(f"ElevenLabs API HTTP Error: {error_detail}")
        raise HTTPException(502, f"Failed to retrieve transcript from ElevenLabs: {error_detail}")
    except requests.exceptions.RequestException as e:
        logger.error(f"ElevenLabs API Request Error: {str(e)}")
        raise HTTPException(502, f"Failed to connect to ElevenLabs API: {str(e)}")
    except Exception as e:
        logger.error(f"Error saving transcript: {str(e)}", exc_info=True)
        db.rollback()  # Rollback on error
        raise HTTPException(500, f"Internal error while saving transcript: {str(e)}")


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
    db.refresh(user_session)

    return {"status": "updated"}


@router.get("/check-completion/{user_id}")
async def check_conversation_completion(
    user_id: str,
    db: Session = Depends(get_db)
):
    """
    Check if the conversation is complete by analyzing the transcript.
    Returns whether all questions have been answered.
    """
    try:
        user_session = db.query(UserSession).filter(UserSession.user_id == user_id).first()

        if not user_session:
            raise HTTPException(404, f"User session not found for user_id: {user_id}")

        transcript = user_session.transcript

        if not transcript or not transcript.strip():
            return {
                "is_complete": False,
                "has_transcript": False,
                "message": "No transcript available"
            }

        # Simple heuristic: Check if transcript contains completion indicators
        # You can customize this based on your agent's behavior
        transcript_lower = transcript.lower()

        # Check for completion indicators
        completion_indicators = [
            "that's all",
            "completed",
            "all questions answered",
            "concludes",
            "valuable feedback",
            "Have a great day"
        ]

        # Check for question-answer patterns
        # Count AGENT and USER messages
        agent_messages = len(transcript.split('[AGENT]:')) - 1
        user_messages = len(transcript.split('[USER]:')) - 1

        # If there are multiple exchanges and the last message suggests completion
        is_complete = (
            (any(indicator in transcript_lower for indicator in completion_indicators) or
             (agent_messages >= 13 and user_messages >= 13))
        )

        return {
            "is_complete": is_complete,
            "has_transcript": True,
            "transcript_length": len(transcript),
            "message": "Complete" if is_complete else "Incomplete - can resume"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking conversation completion: {str(e)}", exc_info=True)
        raise HTTPException(500, f"Error checking completion: {str(e)}")
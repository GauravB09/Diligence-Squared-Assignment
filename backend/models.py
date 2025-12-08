from sqlalchemy import Column, String, DateTime, Integer, Text, Enum as SQLEnum
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.sql import func
import enum

Base = declarative_base()


class SurveyStatus(str, enum.Enum):
    """Enumeration for survey status."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    TERMINATED = "terminated"
    FAILED = "failed"


class UserSession(Base):
    """
    Database model for user survey sessions.
    Stores information about user sessions including survey status, segmentation, and related data.
    """
    __tablename__ = "user_sessions"

    # Primary key
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    # User identification
    user_id = Column(String(255), nullable=False, index=True, unique=True)

    # Survey information
    survey_status = Column(
        SQLEnum(SurveyStatus),
        default=SurveyStatus.PENDING,
        nullable=False,
        index=True
    )

    # Segmentation
    segment = Column(String(100), nullable=True, index=True)

    # ElevenLabs integration
    elevenlabs_conversation_id = Column(String(255), nullable=True, index=True)

    # Transcript of the conversation
    transcript = Column(Text, nullable=True)

    # TypeForm related fields
    form_id = Column(String(255), nullable=True)
    form_token = Column(String(255), nullable=True, unique=True, index=True)
    event_id = Column(String(255), nullable=True, unique=True, index=True)

    # Survey response metadata
    submitted_at = Column(DateTime(timezone=True), nullable=True)

    # Additional metadata
    additional_metadata = Column(Text, nullable=True)  # JSON string for storing additional flexible data

    # Timestamps
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )

    def __repr__(self):
        return f"<UserSession(user_id={self.user_id}, status={self.survey_status})>"


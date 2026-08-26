from datetime import datetime, timezone
from sqlmodel import Field, SQLModel, Relationship
from sqlalchemy import Column, DateTime, UniqueConstraint
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .question import Question
    from .user import User


class QuestionAttempt(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint("question_id", "user_id", name="uq_question_attempt_user"),
    )

    attempt_id: int | None = Field(
        primary_key=True, unique=True, index=True, default=None
    )
    question_id: int = Field(foreign_key="question.question_id", nullable=False)
    user_id: str = Field(foreign_key="user.user_id", nullable=False)
    attempts_count: int = Field(default=0, nullable=False)
    
    codepen_url: str | None = Field(default=None, nullable=True)

    # 🟢 필드명을 명확하게 professor_score로 변경하여 문제 배점(question.score)과 충돌 방지
    professor_score: float | None = Field(default=None, nullable=True)
    reason: str | None = Field(default=None, nullable=True)

    is_correct: bool | None = Field(default=None, nullable=True)

    updated_at: datetime | None = Field(
        sa_column=Column(
            DateTime(timezone=True),
            nullable=False,
            default=lambda: datetime.now(timezone.utc),
            onupdate=lambda: datetime.now(timezone.utc),
        )
    )

    question: "Question" = Relationship(back_populates="attempts")
    user: "User" = Relationship()
from datetime import datetime, timezone
from sqlmodel import Field, SQLModel, Relationship
from sqlalchemy import Column, DateTime, UniqueConstraint
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .question import Question
    from .user import User


class QuestionAttempt(SQLModel, table=True):
    __table_args__ = (
        # 학생 한 명당 문제 하나에 시도 기록은 하나만 존재 (누적 카운트로 관리)
        UniqueConstraint("question_id", "user_id", name="uq_question_attempt_user"),
    )

    attempt_id: int | None = Field(
        primary_key=True, unique=True, index=True, default=None
    )
    question_id: int = Field(foreign_key="question.question_id", nullable=False)
    user_id: str = Field(foreign_key="user.user_id", nullable=False)
    attempts_count: int = Field(default=0, nullable=False)
    # None = 아직 채점 안 됨(미채점), True/False = 교수님이 수동으로 표시한 결과.
    # 나중에 자동 채점을 붙이면 채점 엔진이 이 값을 직접 채우게 됩니다.
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

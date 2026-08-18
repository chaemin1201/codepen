from datetime import datetime, timezone
from sqlmodel import Field, SQLModel, Relationship
from sqlalchemy import Column, DateTime
from typing import TYPE_CHECKING
from enum import Enum
from uuid import uuid4

if TYPE_CHECKING:
    from .user import User
    from .problem import Problem


class SubmissionStatus(str, Enum):
    PENDING = "pending"
    SUBMITTED = "submitted"


class Submission(SQLModel, table=True):
    submission_id: int | None = Field(
        primary_key=True, unique=True, index=True, default=None
    )
    user_id: str = Field(foreign_key="user.user_id", nullable=False)
    problem_id: int = Field(foreign_key="problem.problem_id", nullable=False)
    created_at: datetime | None = Field(
        sa_column=Column(
            DateTime(timezone=True),
            nullable=False,
            default=lambda: datetime.now(timezone.utc),
        )
    )
    submitted_at: datetime | None = Field(
        sa_column=Column(
            DateTime(timezone=True),
            nullable=True,
            default=None,
        )
    )
    codepen_url: str = Field(default="", nullable=False)
    status: SubmissionStatus = Field(default=SubmissionStatus.PENDING, nullable=False)
    filename: str = Field(default_factory=lambda: f"{uuid4()}", nullable=False)
    score: float | None = Field(default=None, nullable=True)

    user: "User" = Relationship(back_populates="submissions")
    problem: "Problem" = Relationship(back_populates="submissions")

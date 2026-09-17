from datetime import datetime, timezone
from typing import Optional, TYPE_CHECKING
from pydantic import BaseModel
from sqlmodel import Field, SQLModel, Relationship
from sqlalchemy import Column, DateTime

if TYPE_CHECKING:
    from .group import Group
    from .category import Category
    from .question import Question


class Problem(SQLModel, table=True):
    problem_id: int | None = Field(
        primary_key=True, unique=True, index=True, default=None
    )
    group_id: int = Field(foreign_key="group.group_id", nullable=False)
    category_id: int | None = Field(
        foreign_key="category.category_id", nullable=True, default=None
    )
    question_count: int = Field(default=1, nullable=False)
    title: str = Field(nullable=False)
    description: str = Field(nullable=False)
    difficulty: str = Field(nullable=False)

    created_at: datetime | None = Field(
        sa_column=Column(
            DateTime(timezone=True),
            nullable=False,
            default=lambda: datetime.now(timezone.utc),
        )
    )
    starts_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True),
            nullable=False,
            default=lambda: datetime.now(timezone.utc),
        )
    )
    deadline: datetime | None = Field(
        sa_column=Column(
            DateTime(timezone=True),
            nullable=True,
            default=None,
        )
    )
    hide_before_start: bool = Field(default=False, nullable=False)

    group: "Group" = Relationship(back_populates="problems")
    category: Optional["Category"] = Relationship(back_populates="problems")
    questions: list["Question"] = Relationship(back_populates="problem")


class ProblemResponse(BaseModel):
    problem_id: int
    group_id: int
    category_id: int | None = None
    question_count: int
    title: str
    description: str
    difficulty: str
    created_at: datetime
    starts_at: datetime
    deadline: datetime | None = None
    hide_before_start: bool
    avg_score: float | None = None
    std_score: float | None = None


def create_problem_response(problem: Problem, is_owner: bool = False):
    return ProblemResponse(
        **problem.model_dump(),
        avg_score=None,
        std_score=None,
    )
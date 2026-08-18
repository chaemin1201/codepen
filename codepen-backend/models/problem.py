from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel
from sqlmodel import Field, SQLModel, Relationship
from sqlalchemy import Column, DateTime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .group import Group
    from .submission import Submission
    from .category import Category
    from .question import Question


class Problem(SQLModel, table=True):
    problem_id: int | None = Field(
        primary_key=True, unique=True, index=True, default=None
    )
    group_id: int = Field(foreign_key="group.group_id", nullable=False)
    # [신규] 카테고리(오리엔테이션/중간고사 등) 소속. 카테고리 없이도 문제를
    # 만들 수 있도록 nullable로 둠 (기존 데이터/기존 흐름과 호환 유지).
    category_id: int | None = Field(
        foreign_key="category.category_id", nullable=True, default=None
    )
    # [신규] 문제지 안에 문항이 몇 개 들어있는지 보여주기 위한 값.
    # 문항별로 실제 제출/채점을 나누는 게 아니라 단순 표시용 메타데이터입니다.
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
    submissions: list["Submission"] = Relationship(back_populates="problem")
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

# 학생에게 다른 사람들의 제출 기록 정보 공개 예방
def create_problem_response(problem: Problem, is_owner: bool = False):
    if not is_owner:
        return ProblemResponse(
            **problem.model_dump(exclude={"submissions"}), # 다른 사람의 제출 기록 제외
            avg_score=None,
            std_score=None
        )
    submissions = problem.submissions
    if not submissions:
        return ProblemResponse(**problem.model_dump(), avg_score=None, std_score=None)
    scores = [
        submission.score for submission in submissions if submission.score is not None
    ]
    if not scores:
        return ProblemResponse(**problem.model_dump(), avg_score=None, std_score=None)
    avg_score = sum(scores) / len(scores)
    std_score = (sum((score - avg_score) ** 2 for score in scores) / len(scores)) ** 0.5
    return ProblemResponse(
        **problem.model_dump(),
        avg_score=avg_score,
        std_score=std_score,
    )

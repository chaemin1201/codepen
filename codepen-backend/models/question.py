from datetime import datetime, timezone
from sqlmodel import Field, SQLModel, Relationship
from sqlalchemy import Column, DateTime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .problem import Problem
    from .question_attempt import QuestionAttempt


class Question(SQLModel, table=True):
    question_id: int | None = Field(
        primary_key=True, unique=True, index=True, default=None
    )
    problem_id: int = Field(foreign_key="problem.problem_id", nullable=False)
    title: str = Field(nullable=False)
    description: str | None = Field(default=None, nullable=True)
    # [신규] 문제 등록 시 보여주는 "제출 예시" (텍스트). 이미지 첨부는 아직 미지원.
    example_output: str | None = Field(default=None, nullable=True)
    score: int = Field(default=10, nullable=False)
    order: int = Field(default=0, nullable=False)
    is_visible: bool = Field(default=True, nullable=False)

    # [단계적 도입] 지금은 정답 여부를 교수님이 수동으로 표시합니다.
    # 나중에 실제 채점 엔진(예: Judge0)을 붙일 때 이 필드들을 이용해서
    # 테스트케이스를 정의하고 자동 채점으로 바꿀 수 있도록 자리만 비워둡니다.
    test_input: str | None = Field(default=None, nullable=True)
    expected_output: str | None = Field(default=None, nullable=True)

    created_at: datetime | None = Field(
        sa_column=Column(
            DateTime(timezone=True),
            nullable=False,
            default=lambda: datetime.now(timezone.utc),
        )
    )

    problem: "Problem" = Relationship(back_populates="questions")
    attempts: list["QuestionAttempt"] = Relationship(back_populates="question")

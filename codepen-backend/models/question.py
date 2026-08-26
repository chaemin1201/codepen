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
    
    # 🟢 [신규 추가] 조건 필드 (DB 컬럼)
    condition: str | None = Field(default=None, nullable=True)

    # [신규] 문제 등록 시 보여주는 "제출 예시" (텍스트).
    example_output: str | None = Field(default=None, nullable=True)
    score: int = Field(default=10, nullable=False)
    order: int = Field(default=0, nullable=False)
    is_visible: bool = Field(default=True, nullable=False)

    # 🟢 첨부파일 원본 이름 저장 필드
    attachment_name: str | None = Field(default=None, nullable=True)

    # [단계적 도입] 정답 여부를 교수님이 수동으로 표시합니다.
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
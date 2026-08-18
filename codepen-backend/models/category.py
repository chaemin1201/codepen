from datetime import datetime, timezone
from enum import Enum
from sqlmodel import Field, SQLModel, Relationship
from sqlalchemy import Column, DateTime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .group import Group
    from .problem import Problem


class CategoryType(str, Enum):
    GENERAL = "general"
    EXAM = "exam"


class Category(SQLModel, table=True):
    category_id: int | None = Field(
        primary_key=True, unique=True, index=True, default=None
    )
    group_id: int = Field(foreign_key="group.group_id", nullable=False)
    title: str = Field(nullable=False)
    type: CategoryType = Field(default=CategoryType.GENERAL, nullable=False)
    # [신규] 주차 시작일. 이 값이 있으면 종료일은 항상 +7일로 자동 계산됩니다
    # (전에는 카테고리 안 문제들의 날짜에서 역산했는데, 문제를 넣기 전에는
    # 항상 비어있어서 "현재 주차" 판정이 안 되던 문제가 있었습니다).
    starts_at: datetime | None = Field(
        sa_column=Column(DateTime(timezone=True), nullable=True)
    )

    created_at: datetime | None = Field(
        sa_column=Column(
            DateTime(timezone=True),
            nullable=False,
            default=lambda: datetime.now(timezone.utc),
        )
    )

    group: "Group" = Relationship(back_populates="categories")
    problems: list["Problem"] = Relationship(back_populates="category")

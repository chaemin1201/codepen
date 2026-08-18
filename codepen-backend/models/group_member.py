from datetime import datetime, timezone
from sqlmodel import Field, SQLModel, Relationship
from sqlalchemy import Column, DateTime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .group import Group
    from .user import User


class GroupMember(SQLModel, table=True):
    group_id: int = Field(
        foreign_key="group.group_id", primary_key=True, nullable=False
    )
    user_id: str = Field(foreign_key="user.user_id", primary_key=True, nullable=False)

    created_at: datetime | None = Field(
        sa_column=Column(
            DateTime(timezone=True),
            nullable=False,
            default=lambda: datetime.now(timezone.utc),
        )
    )
    # [신규] "채점자" 권한 - 교수님이 특정 학생에게 채점을 도울 권한을 줄 수 있도록.
    # 지금은 값만 저장/토글되고, 실제 채점 라우트들의 권한 체크에는 아직
    # 반영하지 않았습니다 (기존 오너 전용 체크를 다 같이 바꿔야 하는 더 큰 작업).
    is_grader: bool = Field(default=False, nullable=False)

    group: "Group" = Relationship(back_populates="members")
    user: "User" = Relationship(back_populates="groups")

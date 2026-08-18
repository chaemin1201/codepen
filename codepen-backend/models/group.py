from datetime import datetime, timezone
from sqlmodel import Field, SQLModel, Relationship
from sqlalchemy import Column, DateTime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .user import User
    from .group_member import GroupMember
    from .problem import Problem
    from .invite_queue import InviteQueue
    from .category import Category


class Group(SQLModel, table=True):
    group_id: int | None = Field(
        primary_key=True, unique=True, index=True, default=None
    )
    group_name: str = Field(nullable=False)
    description: str | None = Field(default=None, nullable=True)
    owner_id: str = Field(foreign_key="user.user_id", nullable=False)
    invite_code: str = Field(nullable=False, unique=True)

    created_at: datetime | None = Field(
        sa_column=Column(
            DateTime(timezone=True),
            nullable=False,
            default=lambda: datetime.now(timezone.utc),
        )
    )

    members: list["GroupMember"] = Relationship(back_populates="group")
    owner: "User" = Relationship(back_populates="owned_groups")
    problems: list["Problem"] = Relationship(back_populates="group")
    invite_queues: list["InviteQueue"] = Relationship(back_populates="group")
    categories: list["Category"] = Relationship(back_populates="group")

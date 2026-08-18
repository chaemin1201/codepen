from datetime import datetime, timezone
from sqlmodel import Field, SQLModel, Relationship
from sqlalchemy import Column, DateTime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .group import Group
    from .user import User


class InviteQueue(SQLModel, table=True):
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

    group: "Group" = Relationship(back_populates="invite_queues")
    user: "User" = Relationship(back_populates="invite_queues")

from datetime import datetime, timezone
from sqlmodel import Field, SQLModel, Relationship
from sqlalchemy import Column, DateTime
from typing import TYPE_CHECKING
from enum import Enum

if TYPE_CHECKING:
    from .group import Group
    from .group_member import GroupMember
    from .submission import Submission
    from .invite_queue import InviteQueue


class UserRole(str, Enum):
    PROFESSOR = "professor"
    STUDENT = "student"


class User(SQLModel, table=True):
    user_id: str = Field(primary_key=True, unique=True, index=True, nullable=False)
    username: str = Field(nullable=False)
    email: str = Field(unique=True, index=True, nullable=False)
    role: UserRole = Field(nullable=False)
    created_at: datetime | None = Field(
        sa_column=Column(
            DateTime(timezone=True),
            nullable=False,
            default=lambda: datetime.now(timezone.utc),
        )
    )

    # Professor related fields
    department: str | None = Field(default=None, nullable=True)
    position: str | None = Field(default=None, nullable=True)
    office: str | None = Field(default=None, nullable=True)

    # Student related fields
    student_no: int | None = Field(default=None, nullable=True)
    grade: int | None = Field(default=None, nullable=True)
    major: str | None = Field(default=None, nullable=True)
    codepen_username: str | None = Field(default=None, nullable=True)

    owned_groups: list["Group"] = Relationship(back_populates="owner")
    groups: list["GroupMember"] = Relationship(back_populates="user")
    submissions: list["Submission"] = Relationship(back_populates="user")
    invite_queues: list["InviteQueue"] = Relationship(back_populates="user")

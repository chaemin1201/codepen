from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Response, Depends
from sqlmodel import Session, select
from pydantic import BaseModel
from db import engine
from models.user import User
from models.group import Group
from models.category import Category, CategoryType
from utils.user import login_required

router = APIRouter(prefix="/category")

# 시작일만 입력받고 종료일은 항상 이만큼 뒤로 자동 계산합니다.
CATEGORY_PERIOD = timedelta(days=7)


class PartialCategory(BaseModel):
    group_id: int
    title: str
    type: CategoryType = CategoryType.GENERAL
    starts_at: str | None = None  # ISO 8601, 없으면 "기간 없음"


class CategoryResponse(BaseModel):
    category_id: int
    group_id: int
    title: str
    type: CategoryType
    created_at: datetime
    period_starts_at: datetime | None = None
    period_ends_at: datetime | None = None
    is_current: bool = False


def create_category_response(category: Category) -> CategoryResponse:
    period_starts_at = category.starts_at
    period_ends_at = (
        period_starts_at + CATEGORY_PERIOD if period_starts_at else None
    )
    now = datetime.now(timezone.utc)
    # [버그 수정] category.starts_at가 timezone 정보 없이(naive) 저장된 적이
    # 있으면(과거 데이터, 또는 클라이언트가 Z 없이 보낸 경우) now(aware)와
    # 비교할 때 "can't compare offset-naive and offset-aware datetimes"로
    # 500 에러가 났습니다. 비교 직전에 항상 UTC aware로 맞춰줍니다.
    def _as_aware(dt: datetime | None) -> datetime | None:
        if dt is None:
            return None
        return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)

    is_current = bool(
        period_starts_at
        and period_ends_at
        and _as_aware(period_starts_at) <= now <= _as_aware(period_ends_at)
    )
    return CategoryResponse(
        category_id=category.category_id,
        group_id=category.group_id,
        title=category.title,
        type=category.type,
        created_at=category.created_at,
        period_starts_at=period_starts_at,
        period_ends_at=period_ends_at,
        is_current=is_current,
    )


def _parse_starts_at(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    # [버그 수정] 입력값에 타임존 정보가 없으면(예: "2026-01-14T13:00:00")
    # UTC로 간주해서 항상 aware datetime으로 통일합니다. 이렇게 안 하면
    # DB에 naive로 저장됐다가 나중에 aware(now)와 비교할 때 TypeError가 납니다.
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _is_member_or_owner(group: Group, current_user: User) -> bool:
    return current_user.user_id in [
        m.user_id for m in group.members
    ] or current_user.user_id == group.owner_id


@router.post("")
async def create_category(
    category: PartialCategory,
    response: Response,
    current_user: User = Depends(login_required),
):
    with Session(engine) as session:
        group = session.get(Group, category.group_id)
        if not group:
            response.status_code = 404
            return {"error": "Group not found"}
        if group.owner_id != current_user.user_id:
            response.status_code = 403
            return {"error": "Forbidden: You are not the owner of this group"}

        new_category = Category(
            group_id=category.group_id,
            title=category.title,
            type=category.type,
            starts_at=_parse_starts_at(category.starts_at),
        )
        session.add(new_category)
        session.commit()
        session.refresh(new_category)
        return create_category_response(new_category)


@router.patch("/{category_id}")
async def update_category(
    category_id: int,
    category: PartialCategory,
    response: Response,
    current_user: User = Depends(login_required),
):
    with Session(engine) as session:
        existing = session.get(Category, category_id)
        if not existing:
            response.status_code = 404
            return {"error": "Category not found"}
        group = session.get(Group, existing.group_id)
        if not group or group.owner_id != current_user.user_id:
            response.status_code = 403
            return {"error": "Forbidden: You are not the owner of this group"}

        existing.title = category.title
        existing.type = category.type
        existing.starts_at = _parse_starts_at(category.starts_at)
        session.add(existing)
        session.commit()
        session.refresh(existing)
        return create_category_response(existing)


@router.get("/group/{group_id}")
async def get_categories_by_group(
    group_id: int, response: Response, current_user: User = Depends(login_required)
):
    with Session(engine) as session:
        group = session.get(Group, group_id)
        if not group:
            response.status_code = 404
            return {"error": "Group not found"}
        # 그룹 멤버이거나 오너여야 조회 가능 (group.py의 get_group_members와 동일한 패턴)
        if not _is_member_or_owner(group, current_user):
            response.status_code = 403
            return {"error": "Forbidden: You are not a member of this group"}

        categories = session.exec(
            select(Category).where(Category.group_id == group_id)
        ).all()
        return [create_category_response(c) for c in categories]


@router.delete("/{category_id}")
async def delete_category(
    category_id: int,
    response: Response,
    current_user: User = Depends(login_required),
):
    with Session(engine) as session:
        existing = session.get(Category, category_id)
        if not existing:
            response.status_code = 404
            return {"error": "Category not found"}
        group = session.get(Group, existing.group_id)
        if not group or group.owner_id != current_user.user_id:
            response.status_code = 403
            return {"error": "Forbidden: You are not the owner of this group"}

        # 카테고리를 지워도 안에 있던 문제(Problem)는 삭제하지 않고
        # category_id만 비워서 "미분류" 상태로 남겨둡니다.
        for problem in existing.problems:
            problem.category_id = None
            session.add(problem)

        session.delete(existing)
        session.commit()
        return {"message": "Category deleted successfully"}

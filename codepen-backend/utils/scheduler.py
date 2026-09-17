from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlmodel import Session, select

from db import engine
from models.category import Category, CategoryType
from models.colab import ColabNotebook
from models.group import Group
from models.problem import Problem
from models.question import Question
from utils.colab import downgrade_notebook_permission

scheduler = AsyncIOScheduler()


# 🟢 시험(exam) 카테고리 + Colab 플랫폼인 문제지의 마감 시각이 되면,
# 그 문제지에 속한 모든 소문제의 학생별 노트북에서 '편집자' 권한을 '읽기 전용'으로 낮춥니다.
async def revoke_colab_write_access_for_problem(problem_id: int):
    from routes.colab import get_valid_drive_token

    with Session(engine) as session:
        problem = session.get(Problem, problem_id)
        if not problem:
            return

        group = session.get(Group, problem.group_id)
        if not group or getattr(group, "platform", "codepen") != "colab":
            return

        category = session.get(Category, problem.category_id) if problem.category_id else None
        if not category or category.type != CategoryType.EXAM:
            # 시험이 아니면(일반 문제지) 편집을 막지 않습니다.
            return

        questions = session.exec(
            select(Question).where(Question.problem_id == problem_id)
        ).all()
        question_ids = [q.question_id for q in questions]
        if not question_ids:
            return

        notebooks = session.exec(
            select(ColabNotebook).where(ColabNotebook.question_id.in_(question_ids))
        ).all()
        if not notebooks:
            return

        drive_token = await get_valid_drive_token(group.owner_id)
        if not drive_token:
            print(f"⚠️ [Colab 권한 회수] problem_id={problem_id}: 교수 Drive 토큰이 없어 건너뜀")
            return

        for notebook in notebooks:
            if not notebook.permission_id:
                continue
            try:
                await downgrade_notebook_permission(drive_token, notebook.file_id, notebook.permission_id)
                print(f"✅ [Colab 권한 회수] file_id={notebook.file_id} (user_id={notebook.user_id}) 읽기 전용으로 전환됨")
            except Exception as e:
                print(f"❌ [Colab 권한 회수 실패] file_id={notebook.file_id}: {e}")


# 🟢 마감 시각 도달 시 실행할 스케줄러 작업
async def handle_problem_deadline_job(problem_id: int):
    try:
        await revoke_colab_write_access_for_problem(problem_id)
    except Exception as e:
        print(f"❌ [스케줄러] Colab 권한 회수 처리 중 오류 (problem_id={problem_id}): {e}")


# 서버 재시작 시 가동될 스케줄러 복구
def sync_active_deadlines_from_db():
    """서버가 리부팅되어 인메모리 잡이 증발했을 때, DB를 읽어 마감되지 않은 스케줄을 재등록합니다."""
    now = datetime.now(timezone.utc)
    with Session(engine) as session:
        problems = session.exec(
            select(Problem).where(Problem.deadline != None)
        ).all()
        
        for problem in problems:
            runtime = problem.deadline.replace(tzinfo=timezone.utc) + timedelta(minutes=5)
            if runtime > now:
                job_id = f"problem_{problem.problem_id}"
                if not scheduler.get_job(job_id=job_id):
                    scheduler.add_job(
                        func=handle_problem_deadline_job,
                        trigger="date",
                        run_date=runtime,
                        args=[problem.problem_id],
                        id=job_id,
                    )


def start_scheduler():
    scheduler.start()
    try:
        sync_active_deadlines_from_db()
    except Exception as e:
        print(f"[스케줄러 초기화 실패] DB 마감일 동기화 중 오류: {str(e)}", flush=True)


def shutdown_scheduler():
    scheduler.shutdown()


def schedule_problem_deadline(problem_id: int | None, deadline: datetime):
    scheduler.add_job(
        func=handle_problem_deadline_job,
        trigger="date",
        run_date=deadline.replace(tzinfo=timezone.utc) + timedelta(minutes=5),
        args=[problem_id],
        id=f"problem_{problem_id}",
    )


def reschedule_problem_deadline(problem_id: int | None, new_deadline: datetime):
    if not scheduler.get_job(job_id=f"problem_{problem_id}"):
        return schedule_problem_deadline(problem_id, new_deadline)
    scheduler.reschedule_job(
        job_id=f"problem_{problem_id}",
        run_date=new_deadline.replace(tzinfo=timezone.utc) + timedelta(minutes=5),
    )
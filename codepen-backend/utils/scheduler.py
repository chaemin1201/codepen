from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlmodel import Session, select
from datetime import datetime, timedelta, timezone

from models.submission import Submission, SubmissionStatus
from models.problem import Problem
from utils.codepen import download_codepen, close_codepen_pen, opened_codepens

from db import engine

scheduler = AsyncIOScheduler()


async def end_codepen_submissions_job(problem_id: int):
    # 대량 유저 처리 시 DB 커넥션 독점 방지
    submission_ids = []
    with Session(engine) as session:
        submissions = session.exec(
            select(Submission).where(
                Submission.problem_id == problem_id,
                Submission.status == SubmissionStatus.PENDING,
            )
        ).all()
        submission_ids = [sub.submission_id for sub in submissions]

    # 개별 비동기 작업 수행 (DB 세션을 열어두지 않음으로써 병목 원천 차단)
    for sub_id in submission_ids:
        with Session(engine) as session:
            submission = session.get(Submission, sub_id)
            if not submission or submission.status != SubmissionStatus.PENDING:
                continue
                
            try:
                # Playwright 다운로드 및 세션 종료
                await download_codepen(submission)
                if submission.codepen_url:
                    await close_codepen_pen(submission.codepen_url)
                
                # 💡 보안/비즈니스 보완 2: 다운로드 완료 후 DB 상태 반영 및 커밋 필수!
                submission.status = SubmissionStatus.SUBMITTED
                submission.submitted_at = datetime.now(timezone.utc)
                
                session.add(submission)
                session.commit()
            except Exception as e:
                # 하나의 제출물이 실패하더라도 다른 학생의 제출물 수집에 영향을 주지 않도록 예외 격리
                print(f"[스케줄러 오류] 제출물 {sub_id} 수집 실패: {str(e)}", flush=True)
                session.rollback()


def print_opened_codepens():
    print([url for url in opened_codepens.keys()])

# 서버 재시작 시 가동될 스케줄러 복구
def sync_active_deadlines_from_db():
    """서버가 리부팅되어 인메모리 잡이 증발했을 때, DB를 읽어 마감되지 않은 스케줄을 재등록합니다."""
    now = datetime.now(timezone.utc)
    with Session(engine) as session:
        # 아직 마감 버퍼(마감+5분)가 지나지 않은 활성화된 과제 조회
        problems = session.exec(
            select(Problem).where(Problem.deadline != None)
        ).all()
        
        for problem in problems:
            # 타임존 정제 및 실행 예정 시각 계산
            runtime = problem.deadline.replace(tzinfo=timezone.utc) + timedelta(minutes=5)
            if runtime > now:
                # 중복 등록 방지를 위해 기존 ID 체크 후 등록
                job_id = f"problem_{problem.problem_id}"
                if not scheduler.get_job(job_id=job_id):
                    scheduler.add_job(
                        func=end_codepen_submissions_job,
                        trigger="date",
                        run_date=runtime,
                        args=[problem.problem_id],
                        id=job_id,
                    )

def start_scheduler():
    scheduler.start()
    # 서버 기동 시 인메모리 유실 상태 복구
    try:
        sync_active_deadlines_from_db()
    except Exception as e:
        print(f"[스케줄러 초기화 실패] DB 마감일 동기화 중 오류: {str(e)}", flush=True)
    scheduler.add_job(
        func=print_opened_codepens,
        trigger="interval",
        hours=1,
        id="print_opened_codepens",
    )


def shutdown_scheduler():
    scheduler.shutdown()


def schedule_problem_deadline(problem_id: int | None, deadline: datetime):
    scheduler.add_job(
        func=end_codepen_submissions_job,
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

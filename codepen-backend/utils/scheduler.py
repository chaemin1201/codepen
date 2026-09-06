from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlmodel import Session, select
from datetime import datetime, timedelta, timezone

from models.submission import Submission, SubmissionStatus
from models.problem import Problem

from db import engine

scheduler = AsyncIOScheduler()


# ⚠️ [수정] utils/codepen.py의 Playwright 스크래핑 기능이 전부 더미(pass)로 대체되면서
# download_codepen()/close_codepen_pen()은 이제 아무 것도 하지 않습니다.
# 즉, 이 잡이 예전처럼 "코드펜에서 데이터를 긁어와서" SUBMITTED로 바꾸는 게 아니라,
# 지금은 사실상 아무 데이터도 수집하지 못한 채 상태만 SUBMITTED로 바뀌는 상태였습니다(버그).
#
# 실제 제출 데이터는 이제 routes/question.py의 /submit 에서 제출 "그 순간"에
# 프론트가 보낸 html/css/js를 받아 QuestionAttempt에 저장하는 방식으로 바뀌었기 때문에,
# 이 구(舊) Submission/스케줄러 흐름은 "마감 시간이 지났는데 학생이 끝까지 제출을 안 한 건"을
# 정리(= 미제출로 확정)하는 용도로만 남겨둡니다. 실제로 이 Submission 모델/엔드포인트를
# 더 이상 아무 데서도 쓰지 않는다면 이 잡 자체를 지워도 됩니다 — 이 부분은 꼭 확인해주세요.
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
                # 🟢 [수정] 더 이상 Playwright로 코드를 긁어올 수 없으므로,
                # 여기서 SUBMITTED로 잘못 바꾸지 않습니다. 마감(+5분 버퍼)이 지나도록 PENDING이면
                # "제출을 시도했지만 끝내 완료하지 못한 건"이라는 의미로 그대로 두고 기록만 남깁니다.
                # → 상태값으로 "마감 후 미완료"를 구분하고 싶다면 models/submission.py의
                #    SubmissionStatus에 EXPIRED 같은 값을 새로 추가하는 게 정석입니다(아래 참고).
                print(
                    f"[스케줄러] 제출물 {sub_id} (problem_id={problem_id}) 이 마감 후에도 "
                    f"PENDING 상태입니다. 데이터 수집 기능은 더 이상 동작하지 않습니다.",
                    flush=True,
                )
            except Exception as e:
                # 하나의 제출물이 실패하더라도 다른 학생의 제출물 처리에 영향을 주지 않도록 예외 격리
                print(f"[스케줄러 오류] 제출물 {sub_id} 마감 처리 실패: {str(e)}", flush=True)
                session.rollback()


# ⚠️ [수정] opened_codepens는 더 이상 존재하지 않는(Playwright 전용) 상태라서 통째로 제거.
# 필요 없다면 start_scheduler()에서 이 잡 등록도 같이 지우는 걸 추천합니다.
def print_opened_codepens():
    print("[스케줄러] Playwright 세션 추적 기능은 더 이상 사용하지 않습니다.", flush=True)

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
    # ⚠️ [수정] print_opened_codepens는 더 이상 의미 있는 일을 하지 않으므로,
    # Submission/스케줄러 흐름을 완전히 걷어내기로 확정되면 이 잡 등록도 함께 삭제하세요.
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

"""
Alembic 환경 설정.

🟢 핵심: sqlalchemy.url을 alembic.ini에 따로 적지 않고, 프로젝트가 이미 쓰고 있는
db.py의 engine을 그대로 재사용합니다. 그래서 .env의 DATABASE_URL 하나만 진실의 원천이
되고, 여러 곳에 같은 값을 중복으로 적어두다가 서로 어긋나는 사고를 막습니다.

🟢 target_metadata: SQLModel의 모든 테이블 정의(models/ 폴더의 모든 파일)를 여기서
전부 import 해야 합니다 - import가 안 된 모델은 alembic이 "존재를 몰라서" autogenerate가
그 테이블의 변경사항을 못 잡아냅니다. 새 모델 파일을 추가할 때마다 아래 import 목록에도
꼭 추가해주세요.
"""

# 🟢 [수정] alembic.exe(또는 alembic 명령어)를 직접 실행하면, 파이썬이 models/ 등을
# 찾는 기준 경로(sys.path)가 프로젝트 루트가 아니라 .venv\Scripts 쪽으로 잡혀서
# "ModuleNotFoundError: No module named 'models'"가 납니다. 이 env.py 파일이 있는
# 폴더(alembic/)의 부모 폴더(=프로젝트 루트)를 직접 sys.path에 넣어서, alembic을
# 어떤 방식으로 실행하든 항상 models/, db.py 등을 찾을 수 있게 합니다.
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# 🟢 [수정] alembic 명령어를 직접 실행하면 main.py가 안 돌기 때문에, main.py에서
# 하던 load_dotenv()가 실행이 안 됩니다. 그러면 db.py가 DATABASE_URL을 못 읽어서
# 조용히 sqlite:///database.db(로컬 임시 DB)로 새서, "지운 그 DB"가 아니라 전혀
# 다른 빈 DB를 보고 비교하는 사고가 날 수 있습니다. 여기서 직접 로드합니다.
from dotenv import load_dotenv
load_dotenv()

from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool
from sqlmodel import SQLModel

from alembic import context

# 🟢 프로젝트 루트가 sys.path에 있어야 아래 import들이 됩니다.
# (보통 alembic을 프로젝트 루트에서 `alembic upgrade head`로 실행하면 자동으로 됩니다.
#  만약 ModuleNotFoundError가 나면, alembic/env.py 맨 위에
#  `import sys, os; sys.path.insert(0, os.getcwd())` 를 추가해주세요.)

# 🟢 [필수] 이 프로젝트의 모든 모델을 여기서 import합니다.
# 새 모델 파일을 추가했다면 이 목록에도 반드시 추가해주세요 - 안 그러면 alembic이
# 그 테이블을 "모르는 테이블"로 취급해서 autogenerate에 안 잡힙니다.
from models.user import User  # noqa: F401
from models.group import Group  # noqa: F401
from models.group_member import GroupMember  # noqa: F401
from models.invite_queue import InviteQueue  # noqa: F401
from models.category import Category  # noqa: F401
from models.problem import Problem  # noqa: F401
from models.question import Question  # noqa: F401
from models.question_attempt import QuestionAttempt  # noqa: F401
from models.colab import GoogleCredential, ColabNotebook  # noqa: F401

# 🟢 실제 DB 연결은 db.py의 engine을 그대로 씁니다 (별도 URL 설정 불필요)
from db import engine as project_engine

# Alembic Config object - alembic.ini의 값들에 접근하는 통로
config = context.config

# 로깅 설정 적용 (alembic.ini의 [loggers] 섹션)
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# 🟢 이 프로젝트의 전체 테이블 정의 - autogenerate가 "코드 상 모델"과 "실제 DB"를
# 비교할 때 기준으로 삼는 값입니다.
target_metadata = SQLModel.metadata

# 🟢 [신규 - 진단용] 지금 정확히 어느 DB에 연결됐고, 모델이 몇 개나 인식됐는지
# 화면에 찍어줍니다. "pass"만 나오는 문제를 원인 파악하는 용도예요.
# 원인 확인 끝나면 이 블록은 지우셔도 됩니다.
print(f"🔍 [Alembic] 연결 대상 DB: {project_engine.url}")
print(f"🔍 [Alembic] 인식된 테이블 목록: {list(target_metadata.tables.keys())}")


def run_migrations_offline() -> None:
    """--sql 옵션으로 SQL 스크립트만 뽑을 때 쓰는 경로 (DB에 직접 연결하지 않음)."""
    url = str(project_engine.url)
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """실제 DB에 연결해서 마이그레이션을 적용하는 일반적인 경로."""
    # 🟢 project_engine을 그대로 재사용 - 커넥션 풀을 새로 만들지 않고 기존 엔진을 씁니다.
    connectable = project_engine

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
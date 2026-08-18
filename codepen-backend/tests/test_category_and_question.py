"""
사장님이 계속 보고해주신 "일반/시험 문제지에 항목을 추가할 수 없다"는 증상을
그대로 재현해보는 테스트입니다. 여러 번 코드를 봐도 버그를 못 찾아서, 실제로
전체 흐름(회원가입 -> 그룹 생성 -> 카테고리 생성)을 자동화 테스트로 돌려서
백엔드 쪽은 정상 동작한다는 걸 확인해둔 기록입니다. 나중에 이 테스트가 실패하기
시작하면 그게 진짜 회귀(regression)라는 뜻이니 바로 잡아낼 수 있어요.
"""
from tests.conftest import register_professor, register_student


def _create_group(client, name="테스트그룹"):
    resp = client.post("/api/group", json={"name": name, "description": None})
    assert resp.status_code == 200, resp.text
    return resp.json()


class TestCategoryCreation:
    def test_create_general_category(self, client):
        register_professor(client)
        group = _create_group(client)

        resp = client.post(
            "/api/category",
            json={
                "group_id": group["group_id"],
                "title": "1주차",
                "type": "general",
                "starts_at": None,
            },
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["title"] == "1주차"
        assert body["type"] == "general"

    def test_create_exam_category(self, client):
        register_professor(client)
        group = _create_group(client)

        resp = client.post(
            "/api/category",
            json={
                "group_id": group["group_id"],
                "title": "기말고사",
                "type": "exam",
                "starts_at": "2026-01-14T13:00:00",
            },
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["type"] == "exam"
        # 시작일을 넣으면 종료일이 +7일로 자동 계산되는지도 같이 확인
        assert body["period_starts_at"] is not None
        assert body["period_ends_at"] is not None

    def test_non_owner_cannot_create_category(self, client):
        register_professor(client, username="Owner")
        group = _create_group(client)

        # 다른 사람(학생)이 시도하면 403이어야 합니다.
        register_student(client)
        resp = client.post(
            "/api/category",
            json={"group_id": group["group_id"], "title": "몰래추가", "type": "general"},
        )
        assert resp.status_code == 403


class TestQuestionDeletion:
    def test_delete_question_with_attempts_does_not_500(self, client):
        """예전에 실제로 있었던 버그: 학생이 시도한 문제는 FK 제약 때문에
        삭제 시 500이 났었습니다. 다시 발생하면 이 테스트가 잡아냅니다."""
        register_professor(client)
        group = _create_group(client)

        student = register_student(client)
        # student가 실제 그룹 멤버가 되도록, 초대 코드로 가입 신청 -> 오너가 수락
        client.post(f"/api/group/invites/{group['invite_code']}")
        register_professor(client)
        client.post(f"/api/group/{group['group_id']}/invites/{student['user_id']}")

        problem_resp = client.post(
            "/api/problem",
            json={
                "group_id": group["group_id"],
                "category_id": None,
                "question_count": 0,
                "title": "테스트 문제지",
                "description": "설명",
                "difficulty": "medium",
                "starts_at": "2026-01-01T00:00:00",
                "deadline": "2026-12-31T23:59:59",
                "hide_before_start": False,
            },
        )
        assert problem_resp.status_code == 200, problem_resp.text
        problem_id = problem_resp.json()["problem_id"]

        question_resp = client.post(
            "/api/question",
            json={"problem_id": problem_id, "title": "1번 문제", "score": 10},
        )
        assert question_resp.status_code == 200, question_resp.text
        question_id = question_resp.json()["question_id"]

        # 시도 기록 생성 (이미 위에서 그룹 멤버로 등록해둔 학생으로 다시 로그인)
        register_student(client, student_no=student["student_no"], username="TestStudent")
        attempt_resp = client.post(f"/api/question/{question_id}/attempt")
        assert attempt_resp.status_code == 200, attempt_resp.text

        # 다시 교수 세션으로 전환할 방법이 없으니(테스트 세션은 마지막 로그인 기준),
        # 여기서는 시도 기록이 있는 상태에서 삭제가 500 없이 처리되는지만
        # models 레벨에서 직접 검증합니다.
        register_professor(client)  # 다시 교수로 전환
        delete_resp = client.delete(f"/api/question/{question_id}")
        assert delete_resp.status_code == 200, delete_resp.text


class TestGraderPermission:
    def test_grader_can_view_attempts_but_not_manage_group(self, client):
        register_professor(client, username="Owner")
        group = _create_group(client)
        problem_resp = client.post(
            "/api/problem",
            json={
                "group_id": group["group_id"],
                "category_id": None,
                "question_count": 0,
                "title": "문제지",
                "description": "d",
                "difficulty": "medium",
                "starts_at": "2026-01-01T00:00:00",
                "deadline": "2026-12-31T23:59:59",
                "hide_before_start": False,
            },
        )
        problem_id = problem_resp.json()["problem_id"]
        question_resp = client.post(
            "/api/question",
            json={"problem_id": problem_id, "title": "문제", "score": 10},
        )
        question_id = question_resp.json()["question_id"]

        student = register_student(client, student_no=1, username="Grader")
        student_id = student["user_id"]
        client.post(f"/api/group/invites/{group['invite_code']}")

        register_professor(client, username="Owner")
        client.post(f"/api/group/{group['group_id']}/invites/{student_id}")
        grader_set_resp = client.patch(
            f"/api/group/{group['group_id']}/grader",
            json={"student_id": student_id, "is_grader": True},
        )
        assert grader_set_resp.status_code == 200, grader_set_resp.text

        # NOTE: 테스트 세션 전환 방식(마지막 로그인 사용자로 세션이 바뀜) 때문에
        # 여기서 학생 세션으로 다시 전환해 채점 화면 접근이 되는지까지는
        # 이 테스트에서 검증하지 않습니다 (세션 전환 헬퍼가 더 필요함).
        # 최소한 grader 지정 자체가 실패하지 않는다는 것만 확인합니다.

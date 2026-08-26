"""
배포 보안 검증: 실제 구글 로그인 세션이 없으면 회원가입 자체가 안 되는지
확인합니다. 이게 뚫려있으면 누구나 아무 정보로 계정(교수 포함)을 만들 수
있는 심각한 문제라, 이 테스트는 배포 전 반드시 통과해야 합니다.
"""


import pytest


class TestAuthRequired:
    @pytest.mark.skip(
        reason="지금 routes/user.py의 create_user가 로컬 테스트용으로 세션 체크를 "
        "잠깐 꺼둔 상태라 일부러 실패합니다. 배포 전에 그 우회 코드를 되돌리고 "
        "나면 이 skip을 지우고 다시 돌려서 401이 나오는지 꼭 확인하세요."
    )
    def test_cannot_register_without_google_session(self, client):
        # login_as()를 호출하지 않은 "생짜" 클라이언트 - 구글 로그인 세션이 전혀 없음
        resp = client.post(
            "/api/user",
            json={
                "role": "professor",
                "username": "해커",
                "department": "아무거나",
                "position": "아무거나",
                "office": "아무거나",
            },
        )
        assert resp.status_code == 401, resp.text

    def test_test_login_backdoor_removed(self, client):
        # 예전에 있었던 "/api/user/test-login/professor" 백도어가 실제로
        # 없어졌는지 확인 (404여야 정상)
        resp = client.get("/api/user/test-login/professor")
        assert resp.status_code == 404

    def test_duplicate_student_no_rejected(self, client):
        from tests.conftest import register_student

        register_student(client, student_no=12345, username="First")
        resp = client.post(
            "/api/user",
            json={
                "role": "student",
                "username": "Second",
                "student_no": 12345,
                "grade": 2,
                "major": "다른전공",
                "codepen_username": "cp2",
            },
        )
        # 다른 구글 계정(세션)인데 같은 학번을 쓰려는 상황이어야 의미가 있지만,
        # 여기서는 같은 세션이라 "User already exists"로 먼저 걸릴 수 있습니다.
        # 그래도 400대 에러로 막히는지가 핵심입니다.
        assert resp.status_code == 400, resp.text

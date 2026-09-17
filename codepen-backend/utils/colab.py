import re
import httpx

GOOGLE_DRIVE_API_KEY = None  # main.py 등 앱 시작 시점에서 os.environ으로 채워도 되고, 아래처럼 직접 읽어도 됩니다.

import os
GOOGLE_DRIVE_API_KEY = os.environ.get("GOOGLE_DRIVE_API_KEY", "")

# Colab 공유 링크에서 구글 드라이브 file id를 추출하는 정규식
# 예: https://colab.research.google.com/drive/1AbCdEfGhIjKlMnOpQrStUvWxYz?usp=sharing
COLAB_URL_REGEX = r"https:\/\/colab\.research\.google\.com\/drive\/([a-zA-Z0-9_-]+)"


def get_colab_file_id(colab_url: str) -> str:
    """Colab 공유 URL에서 구글 드라이브 file id를 추출합니다."""
    match = re.search(COLAB_URL_REGEX, colab_url)
    if not match:
        raise ValueError(
            f"유효하지 않은 Colab URL입니다. 'https://colab.research.google.com/drive/...' 형식이어야 합니다: {colab_url}"
        )
    return match.group(1)


async def download_colab_snapshot(colab_url: str) -> bytes:
    """공개 공유된(Anyone with the link) Colab 노트북 원본(.ipynb)을 다운로드합니다."""
    if not GOOGLE_DRIVE_API_KEY:
        raise RuntimeError("GOOGLE_DRIVE_API_KEY 환경변수가 설정되지 않았습니다.")

    file_id = get_colab_file_id(colab_url)
    url = f"https://www.googleapis.com/drive/v3/files/{file_id}"
    params = {"alt": "media", "key": GOOGLE_DRIVE_API_KEY}

    async with httpx.AsyncClient() as client:
        response = await client.get(url, params=params, timeout=30.0)
        if response.status_code != 200:
            raise Exception(
                f"Colab 다운로드 실패 (상태 코드: {response.status_code}). "
                f"공유 설정이 '링크가 있는 모든 사용자'로 되어 있는지 확인해주세요."
            )
        return response.content

# 🟢 [신규 - 2단계] 학생별 Colab 노트북 자동 생성 + 공유
# 여기서부터는 API 키(읽기 전용)가 아니라, 교수 개인 계정의 OAuth access_token으로
# Drive에 "쓰기" 작업(파일 생성, 권한 공유)을 합니다. (routes/colab.py의
# get_valid_drive_token()으로 얻은 토큰을 그대로 넘겨받아 씁니다.)

# 새로 만들 노트북의 최소 뼈대 (빈 코드 셀 하나만 있는 유효한 .ipynb 구조)
_BLANK_NOTEBOOK_JSON = {
    "nbformat": 4,
    "nbformat_minor": 0,
    "metadata": {
        "colab": {"provenance": []},
        "kernelspec": {"name": "python3", "display_name": "Python 3"},
    },
    "cells": [
        {
            "cell_type": "code",
            "source": [],
            "metadata": {},
            "execution_count": None,
            "outputs": [],
        }
    ],
}


async def create_notebook_for_student(access_token: str, title: str) -> tuple[str, str]:
    """교수의 Drive에 학생용 빈 Colab 노트북을 새로 만듭니다.
    반환값: (file_id, web_view_link)"""
    import json as _json

    headers = {"Authorization": f"Bearer {access_token}"}

    metadata = {
        "name": f"{title}.ipynb",
        "mimeType": "application/vnd.google.colaboratory",
    }
    notebook_content = _json.dumps(_BLANK_NOTEBOOK_JSON)

    boundary = "noti_world_boundary"
    multipart_body = (
        f"--{boundary}\r\n"
        f"Content-Type: application/json; charset=UTF-8\r\n\r\n"
        f"{_json.dumps(metadata)}\r\n"
        f"--{boundary}\r\n"
        f"Content-Type: application/json\r\n\r\n"
        f"{notebook_content}\r\n"
        f"--{boundary}--"
    )

    async with httpx.AsyncClient(timeout=15.0) as client:
        res = await client.post(
            "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
            headers={
                **headers,
                "Content-Type": f"multipart/related; boundary={boundary}",
            },
            content=multipart_body,
        )

    if res.status_code >= 400:
        raise Exception(f"Colab 노트북 생성 실패 (status={res.status_code}): {res.text}")

    data = res.json()
    file_id = data.get("id")
    web_view_link = data.get("webViewLink") or f"https://colab.research.google.com/drive/{file_id}"
    if not file_id:
        raise Exception(f"Colab 노트북 생성 응답에 파일 ID가 없습니다: {data}")

    return file_id, web_view_link


async def share_file_with_email(access_token: str, file_id: str, email: str) -> str:
    """생성한 노트북을 특정 학생 이메일에 '편집자(writer)' 권한으로 공유합니다.
    반환값: permission_id (나중에 마감 시각에 이 권한만 콕 집어서 낮추는 데 씁니다)"""
    headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=15.0) as client:
        res = await client.post(
            f"https://www.googleapis.com/drive/v3/files/{file_id}/permissions?sendNotificationEmail=false&fields=id",
            headers=headers,
            json={"type": "user", "role": "writer", "emailAddress": email},
        )

    if res.status_code >= 400:
        raise Exception(f"노트북 공유 실패 (status={res.status_code}): {res.text}")

    return res.json().get("id")


# 🟢 [신규 - 4단계] 마감 시각이 되면 학생의 '편집자' 권한을 '읽기 전용'으로 낮춥니다.
# 권한을 아예 삭제(permissions.delete)하지 않고 '읽기 전용(reader)'으로만 낮추는 이유는,
# 학생이 마감 전까지 작성한 내용을 채점 화면과 별개로 본인이 계속 열람은 할 수 있게
# 하기 위함입니다 (완전히 접근을 끊고 싶다면 delete로 바꾸면 됩니다).
async def downgrade_notebook_permission(access_token: str, file_id: str, permission_id: str) -> None:
    headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=15.0) as client:
        res = await client.patch(
            f"https://www.googleapis.com/drive/v3/files/{file_id}/permissions/{permission_id}",
            headers=headers,
            json={"role": "reader"},
        )

    if res.status_code >= 400:
        raise Exception(f"권한 변경 실패 (status={res.status_code}): {res.text}")


# 🟢 [신규 - 3단계] 교수 OAuth 토큰으로 노트북 원본을 가져옵니다.
# API 키(GOOGLE_DRIVE_API_KEY) 방식은 "링크가 있는 모든 사용자"로 공개된 파일만
# 읽을 수 있는데, 2단계에서 만든 노트북은 교수+학생에게만 공유된 비공개 파일이라
# API 키로는 못 읽습니다. 교수 토큰을 쓰면 비공개 파일도 읽을 수 있습니다.
async def download_notebook_with_oauth(access_token: str, file_id: str) -> bytes:
    headers = {"Authorization": f"Bearer {access_token}"}
    url = f"https://www.googleapis.com/drive/v3/files/{file_id}"
    params = {"alt": "media"}

    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.get(url, headers=headers, params=params)
        if res.status_code >= 400:
            raise Exception(f"Colab 노트북 다운로드 실패 (status={res.status_code}): {res.text}")
        return res.content
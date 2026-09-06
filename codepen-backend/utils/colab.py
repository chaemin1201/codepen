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
FROM python:trixie
WORKDIR /app
COPY ./requirements.txt /app/requirements.txt
RUN apt update && apt upgrade -y
RUN apt install -y --no-install-recommends build-essential xvfb
RUN pip install -U pip
RUN pip install -r requirements.txt
RUN playwright install --with-deps
ENV DISPLAY=:99
EXPOSE 8000
CMD ["sh", "-c", "rm -f /tmp/.X99-lock && Xvfb :99 -screen 0 1280x720x24 & sleep 2 && fastapi run main.py"]
# syntax=docker/dockerfile:1
# Build context is the repository root:  docker build -f backend/Dockerfile .
FROM python:3.12-slim AS run
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 UPLOAD_DIR=/data/uploads
WORKDIR /srv/backend

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
RUN mkdir -p /data/uploads
VOLUME ["/data/uploads"]
EXPOSE 8000

# Applies pending migrations (stamping databases created by the old Prisma setup), then serves the API.
CMD ["sh", "-c", "python -m app.cli migrate && uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*'"]

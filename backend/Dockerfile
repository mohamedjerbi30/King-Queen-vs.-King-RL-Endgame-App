# Backend image for a host with a persistent server (Render, Railway, Fly.io, a VPS…).
# Training jobs and WebSocket streams live in process memory, so run ONE worker
# process with threads — never several workers, never serverless.
FROM python:3.11-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY run.py wsgi.py build_dp.py ./

# Solve the DP once at build time (~3 min) so the server starts ready.
RUN python build_dp.py

ENV PORT=5000
EXPOSE 5000
CMD gunicorn --workers 1 --worker-class gthread --threads 32 --timeout 0 --bind 0.0.0.0:${PORT} run:app

"""Gunicorn config — production WSGI cho gpu-service.

Một worker duy nhất: jobs_db / job_queue / GPU state nằm in-process.
Nhiều worker sẽ tách state → job train/eval không còn nhất quán.
"""
import os

bind = f"{os.environ.get('HOST', '0.0.0.0')}:{os.environ.get('PORT', '5000')}"
workers = 1
threads = int(os.environ.get("GUNICORN_THREADS", "8"))
worker_class = "gthread"
# Train/eval/stream có thể kéo dài — 0 = không timeout worker.
timeout = int(os.environ.get("GUNICORN_TIMEOUT", "0"))
graceful_timeout = 30
keepalive = 5
accesslog = "-"
errorlog = "-"
loglevel = os.environ.get("GUNICORN_LOG_LEVEL", "info")
capture_output = True


def post_worker_init(worker):
    from app import start_background_services

    start_background_services()

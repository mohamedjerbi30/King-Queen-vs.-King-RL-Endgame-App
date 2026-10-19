"""
WebSocket streams (flask-sock), so the UI gets training progress pushed in
real time instead of polling:

  /api/ws/train/<job_id>   one job: status, counters, new learning-curve points,
                           exact evaluations — ~10 messages/s while it changes,
                           closes once training and evaluation are finished.
  /api/ws/jobs             the list of trained agents, re-sent whenever it
                           changes (new run, progress, finished), so every
                           page's agent selector updates immediately.

Jobs live in this process's memory, so the backend must run as ONE long-lived
process (dev server, or gunicorn with a single worker and threads). Serverless
hosts such as Vercel can't keep jobs or WebSocket connections alive.
"""
from __future__ import annotations
import json
import socket

from flask import request

from flask_sock import Sock
from simple_websocket import ConnectionClosed

from .jobs import job_registry

sock = Sock()

TRAIN_INTERVAL = 0.1   # seconds between job updates
JOBS_INTERVAL = 0.5    # seconds between job-list checks


def _send(ws, payload) -> bool:
    try:
        ws.send(json.dumps(payload))
        return True
    except ConnectionClosed:
        return False


def _let_client_close(ws, limit=10.0):
    """Ask the browser to close (it does on "end"/"error") instead of closing
    from the server side, then detach the raw socket. With the Werkzeug dev
    server, flask-sock would otherwise write an HTTP response onto the finished
    WebSocket, which browsers report as "Invalid frame header". (gunicorn,
    used in production, does not have this problem.)"""
    waited = 0.0
    while waited < limit and _wait(ws, 0.5):
        waited += 0.5
    raw = request.environ.get("werkzeug.socket")
    if raw is not None:
        try:
            raw.shutdown(socket.SHUT_WR)
        except OSError:
            pass


def _wait(ws, seconds) -> bool:
    """Sleep, but notice a closed connection (receive raises once the client is gone)."""
    try:
        ws.receive(timeout=seconds)
        return True
    except ConnectionClosed:
        return False


@sock.route("/api/ws/train/<job_id>")
def train_stream(ws, job_id):
    job = job_registry.get(job_id)
    if job is None:
        _send(ws, {"type": "error", "error": "unknown job_id"})
        _let_client_close(ws)
        return
    sent_points = 0
    last_meta = None
    while True:
        summary = job.summary()
        curve = summary.pop("curve")
        new_points = curve[sent_points:]
        meta = json.dumps(summary, sort_keys=True)
        if new_points or meta != last_meta:
            ok = _send(ws, {"type": "job", "job": summary, "curve_from": sent_points, "curve": new_points})
            if not ok:
                return
            sent_points = len(curve)
            last_meta = meta
        if summary["status"] != "running" and summary["eval_status"] != "running":
            _send(ws, {"type": "end"})
            _let_client_close(ws)
            return
        if not _wait(ws, TRAIN_INTERVAL):
            return


@sock.route("/api/ws/jobs")
def jobs_stream(ws):
    last = None
    while True:
        jobs = job_registry.list()
        payload = json.dumps(jobs, sort_keys=True)
        if payload != last:
            if not _send(ws, {"type": "jobs", "jobs": jobs}):
                return
            last = payload
        if not _wait(ws, JOBS_INTERVAL):
            return

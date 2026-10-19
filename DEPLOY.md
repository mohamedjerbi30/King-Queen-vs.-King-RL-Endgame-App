# Deploying the app (backend with WebSockets)

## Why the backend cannot stay on Vercel

Vercel runs the Flask backend as **serverless functions**: each request may hit a different short-lived instance.

- **Training jobs vanish.** `POST /api/train/start` starts a run in one instance, which stops right after answering. `GET /api/train/status/<id>` then reaches another instance that never heard of the job, and answers **404**.
- **Trained agents never show up.** For the same reason, the agent selectors in Play and Explore stay empty.
- **No WebSockets.** Vercel functions cannot keep a WebSocket open, so the live training stream is impossible there.
- **No exact DP.** The ~360 MB DP cache cannot be built or stored there, so exact values and exact tests are unavailable.

The backend needs **one long-running process**. The frontend can stay on Vercel.

```
Browser ──HTTPS──► Vercel (React static build)
   │
   └──HTTPS + WSS──► Render / Railway / VPS (Flask + flask-sock, 1 process, threads)
```

## 1. Deploy the backend on Render

The repository contains a Render blueprint ([render.yaml](render.yaml)) and [backend/Dockerfile](backend/Dockerfile). The image solves the DP once at build time ([backend/build_dp.py](backend/build_dp.py), ~3 min), so the server starts ready.

1. Push the repository to GitHub.
2. In Render, choose **New → Blueprint** and select the repository. Render reads `render.yaml`.
3. Keep a plan with **2 GB of RAM** (`standard`). The server uses ~0.4 GB at rest and around 1 GB while an exact test runs; smaller plans will run out of memory.
4. Wait for the build. Then check `https://<your-service>.onrender.com/api/health` → `{"ok": true}`.

The start command is fixed in the Dockerfile:

```
gunicorn --workers 1 --worker-class gthread --threads 32 --timeout 0 --bind 0.0.0.0:$PORT run:app
```

Keep **exactly one worker**: jobs live in that process's memory. Threads serve the parallel HTTP requests and WebSocket streams. `--timeout 0` stops gunicorn from killing long-lived WebSocket connections.

Railway, Fly.io or any VPS work the same way: build the Dockerfile in `backend/` and expose `$PORT`.

## 2. Point the Vercel frontend at the backend

1. In the Vercel project, go to **Settings → Environment Variables** and add:
   `VITE_API_BASE = https://<your-service>.onrender.com` (no trailing slash).
2. Redeploy the frontend. Vite inlines the variable at build time.

The frontend then calls `https://<service>/api/...` for HTTP and `wss://<service>/api/ws/...` for the live streams. The backend already allows cross-origin requests (flask-cors).

Once this works, the `backend` service and the `/api` rewrite in [vercel.json](vercel.json) are no longer used and can be removed.

## 3. Running locally (unchanged)

```bash
cd backend && pip install -r requirements.txt && python run.py   # http://localhost:5000 (serves the built frontend too)
cd frontend && npm install && npm run dev                          # http://localhost:5173 (proxies /api and WebSockets)
```

## Live streams

| Stream | Pushes |
|---|---|
| `/api/ws/train/<job_id>` | progress, new learning-curve points (~400 per run, only the new ones per message, ~6 messages/s) and exact-test results; ends when training and testing are done |
| `/api/ws/jobs` | the list of trained agents whenever it changes, so every page's selector updates immediately |

If a WebSocket cannot be opened, the page falls back to polling automatically. The small dot next to the agent selector tells which mode is in use: green = live, gold = polling, red = server unreachable.

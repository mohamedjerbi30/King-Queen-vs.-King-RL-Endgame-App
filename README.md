# King & Queen vs. King — RL Endgame App

A full-stack reinforcement-learning demo built from the "Basic Chess Endgame"
presentation: a from-scratch KQvK (King+Queen vs. King) chess engine, an
exact finite-horizon dynamic-programming solver, a first-visit Monte Carlo
control agent, a Flask REST API, and a React frontend with four modes.

- **Backend:** Flask (Python), pure-Python chess rules, numpy-vectorized DP.
- **Frontend:** React (Vite), recharts for the learning-curve / results charts.

## What's inside

- `backend/app/chess_engine.py` — legal-move generation, checkmate/stalemate
  detection, episode stepping, for the KQvK endgame.
- `backend/app/state_space.py` — enumerates all valid "White to move" boards
  (144,508 of them; 18,081 under the 8-fold board symmetry) and canonicalizes
  a board to its symmetry representative.
- `backend/app/dp_solver.py` — exact solution via backward induction over the
  move budget (finite-horizon MDP, since the remaining-move count is part of
  the state). Vectorized with numpy; solves from scratch in well under a
  minute once the transition table is cached.
- `backend/app/mc_agent.py` — first-visit Monte Carlo control: constant step
  size α, fixed ε-greedy exploration, optimistic Q0 initialization — matching
  the presentation's documented algorithm exactly.
- `backend/app/routes.py` — the REST API consumed by the frontend.
- `backend/app/results_data.py` — the project's official, previously-measured
  numbers (100,000,000 episodes × 3 seeds) shown on the Results Dashboard.
- `frontend/src/components/` — `PlayMode`, `ExploreMode`, `TrainMode`,
  `DashboardMode`, plus a shared `ChessBoard` component.

Reward structure, discount, and hyperparameters reproduce the presentation
exactly: reward = +1 (checkmate) / −1 (any other game end) / −0.01 (per
step), γ = 0.99, move budget = 40, α = 0.01, ε = 0.05 (fixed), Q0 = +1.

## Running it

### Backend

```bash
cd backend
pip install -r requirements.txt
python run.py
```

Starts the API on `http://localhost:5000`. The first time `/api/dp/solve` is
triggered (or the first time the Explore/Dashboard tab asks for it), the
exact DP solution is computed from scratch:

1. Enumerate the state space (~3 seconds).
2. Build the transition table (~2–3 minutes, one-time).
3. Backward induction over the 40-step budget (~20 seconds).

After that first run, the state space, transition table, and DP solution are
all cached to `backend/app/data/` (pickle / `.npz`), so subsequent server
restarts load instantly — no need to re-solve.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Starts the Vite dev server on `http://localhost:5173`, which proxies `/api/*`
to the Flask backend on port 5000 (see `vite.config.js`). Open
`http://localhost:5173` in a browser.

For a production build: `npm run build` (outputs to `frontend/dist/`); serve
that directory with any static file server, pointed at a reachable Flask API
(update the proxy / base URL for your deployment).

## The four modes

1. **Play** — play White yourself (click a piece, then a highlighted
   destination), or let an agent (exact DP or a trained Monte Carlo job) play
   White while you watch. Black's king always replies automatically,
   following the engine's rules.
2. **Explore values** — type in any legal board (king/queen/king squares,
   moves remaining), or click squares to place pieces, and see every legal
   move's value drawn on the board: exact q\*(s, a) from DP (all tied optimal
   moves starred, mate/stalemate moves flagged), or a training job's learned
   Q(s, a) with its visit count (untried moves still show Q0).
3. **Live Training** — start a bounded Monte Carlo training run (100 to
   500,000 episodes), with a "Report settings" and a "Fast demo"
   (α = 0.1, Q0 = 0) preset. The chart shows the noisy ε-greedy training
   return, plus exact evaluations of the greedy policy over all 144,508
   boards (mean return, % of v\*, mate rate, moves to mate, agreement with
   π\*), run on demand and automatically when training ends. Jobs then show
   up in the job picker of Play and Explore.
4. **Results** — the report's numbers, with the baselines and π\*
   re-evaluated exactly on the server (uniform random, "safe" random, π\*),
   the real learning curves measured with this app, and a DP-vs-MC summary.

## Deployment

The backend must run as one long-lived process (training jobs and WebSocket streams live in its memory), so it cannot run on Vercel's serverless functions. See [DEPLOY.md](DEPLOY.md): backend on Render (Dockerfile + `render.yaml`), frontend on Vercel with `VITE_API_BASE`.

## Interface notes

- **Live updates:** training progress and the list of trained agents are pushed over WebSockets (`/api/ws/train/<id>`, `/api/ws/jobs`), with an automatic polling fallback.
- **End-of-game banner:** every finished game (Play or Explore) shows the result, what it means and the next actions.
- **Guide:** every page opens a step-by-step guide on its first visit (it spotlights each control and explains it); replay it with **? Guide**, or tick "show every time".
- **Saved in your browser:** games, positions, settings, the selected trained agent and guide progress are stored in `localStorage` (keys prefixed `kqk.`). **Reset saved data** in the header clears them.
- **Reusable UI components** live in `frontend/src/ui/` (Button, Select, Field, Segmented, Card…); helpers in `frontend/src/lib/` (storage, notation, "mate in N"); the guide in `frontend/src/tour/`.

## Exact policy evaluation

`backend/app/policy_eval.py` evaluates any White policy exactly on the DP
transition table (same backward recursion as the solver, but averaging over
the policy instead of maximising) and returns the mean return, mate
probability and expected moves to mate. `python backend/test_policy_eval.py`
uses it to check the report's figures: uniform random 1.2% / −0.979, safe
random 15.9% / −0.729, π\* 100% / 0.927126 / 4.70 moves.

## Notes

- The DP solve and any Monte Carlo training job run in background daemon
  threads so the Flask server stays responsive; the frontend polls status
  endpoints to update progress bars / charts.
- All chess logic, state-space enumeration, DP solving, and the MC agent
  were built from scratch for this project (not reused from any earlier
  prototype), and validated against the presentation's reported numbers at
  three independent checkpoints: exact state/symmetry counts (144,508 /
  18,081), exact DP value (v\* = 0.927126), and rollout mate rate / moves-to-
  mate under the optimal policy.

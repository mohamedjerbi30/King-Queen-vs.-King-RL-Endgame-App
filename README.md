# King & Queen vs. King — RL Endgame App

A full-stack reinforcement-learning demo built from the "Basic Chess Endgame"
presentation: a from-scratch KQvK (King+Queen vs. King) chess engine, an
exact finite-horizon dynamic-programming solver, the five tabular learners of the report (MC mean, MC constant, SARSA, Expected SARSA, Q-learning)
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
- `backend/app/tabular.py` — the report's learners (MC mean / constant,
  SARSA, Expected SARSA, Q-learning) on the report's representation: Q indexed
  by `(h - 1) * 499,496 + shared(board, action)`, uniform-h resets, epsilon
  schedule `max(0.02, (1 + D/10000)^-1/2)`, Q0 = 0. The same algorithm runs in
  the browser (`frontend/src/lib/engine.js`).
- `backend/app/routes.py` — the REST API consumed by the frontend.
- `backend/app/results_data.py` — the project's official, previously-measured
  numbers (exact DP benchmarks and the final MC/TD comparison) shown on the Results page.
- `frontend/src/components/` — `PlayMode`, `ExploreMode`, `TrainMode`,
  `DashboardMode`, plus a shared `ChessBoard` component.

Reward structure, discount, and hyperparameters reproduce the presentation
exactly: reward = +1 (checkmate) / −1 (any other game end) / −0.01 (per
step), γ = 0.99, move budget = 40; learners: α = 0.10 (1/N for MC mean), Q0 = 0, ε = max(0.02, (1 + D/10000)^-1/2).

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
   destination), or let an agent play White while you watch: the exact DP
   policy, or one of your trained agents (MC or TD). Black's king replies with
   a random legal move. A banner explains how each game ended.
2. **Explore values** — set up or play through any legal position and see
   every legal move's value on the board as a "mate in N" tag: exact q\*(s, a)
   from DP, a trained agent's learned Q(s, h, a) with visit counts, or both
   side by side ("Compare").
3. **Live Training** — train any of the report's five learners (MC mean, MC
   constant, SARSA, Expected SARSA, Q-learning) with the report's protocol and
   a budget in decisions (2 M quick demo, or the report's 20 M in about a
   minute). Training always runs in the browser (Web Worker); agents are saved
   in IndexedDB.
4. **Results** — your own games and agents, then the report's reference
   numbers: the baselines and π\* re-evaluated exactly on the server, and the
   final MC/TD comparison (20 M decisions × 3 seeds).

## Deployment

The backend must run as one long-lived process (training jobs and WebSocket streams live in its memory), so it cannot run on Vercel's serverless functions. Agents can also be trained **in the browser** (`frontend/src/lib/engine.js`, a tested port of the Python engine and the report's learners, run in a Web Worker and saved in IndexedDB), so training works on the hosted Vercel version too. See [DEPLOY.md](DEPLOY.md): Vercel only (browser training), or backend on Render (Dockerfile + `render.yaml`) for the DP features.

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

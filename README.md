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
2. **Explore Q-table** — type in any legal board (king/queen/king squares,
   moves remaining) and see every candidate move's value, from either the
   exact DP solution or a Monte Carlo training job's learned Q-table, with
   the best move starred.
3. **Live Training** — start a bounded Monte Carlo training run (100 to
   500,000 episodes) and watch the mean return and mate rate climb in real
   time on a live chart. This is a small-scale, interactive demo, not a
   reproduction of the full 100M-episode run — use the returned job id in
   Play or Explore mode to try out what it has learned.
4. **Results Dashboard** — the project's official, previously-measured
   numbers: state-space size, the exact optimal value v\*, and the final
   Monte Carlo agent's performance (100M episodes × 3 seeds) compared against
   random baselines. This server's own from-scratch DP solver reproduces
   v\* = 0.927126 exactly, confirming the two implementations agree.

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

# How the app works: the agent, the 4 modes, DP vs Monte Carlo

This file answers five questions:

1. What is the agent in **Play**, and where does it come from?
2. What does **Explore values** (the Q-table) show?
3. What does the **Results** page show?
4. What is the difference between **Optimal (DP)** and a **trained agent (MC / TD)**?
5. What does **Live Training** do?

---

## 0. The setting in one paragraph

The board has three pieces: a White king, a White queen and a Black king.

- **The agent is White.** It controls both the king and the queen, and plays one move per turn.
- **Black is not an agent.** It learns nothing. After every White move it picks one of its legal king moves completely at random. In the code this is one line: `reply = rng.choice(legal_black)` in [chess_engine.py:237](backend/app/chess_engine.py#L237).
- **Rewards:**
  - +1 when White checkmates.
  - −1 when the game ends any other way: stalemate, queen captured, or 40 White moves used up.
  - −0.01 for every move while the game continues, so faster mates are worth more.
- **Discount:** γ = 0.99.
- **State:** where the 3 pieces are, plus **h**, the number of White moves left. There are 144,508 legal piece placements.

Whatever the source, the agent always does the same thing: it looks up a **table of values** for the current position and plays the **move with the highest value**. The only question is where that table comes from. There are two possible sources: DP and Monte Carlo.

---

## 1. Where the agent comes from (the exact path in the code)

### 1.1 What happens when you click "Suggest a move" or let the Agent play

```
PlayMode.jsx  requestAgentMove()          (frontend, the button / auto-play)
   │
   ▼
api.js  agentMove()  →  GET /api/agent_move?wk=..&wq=..&bk=..&moves_left=..&source=dp|mc
   │
   ▼
routes.py  agent_move()                   (backend, Flask)
   │
   ├── source = "dp"  →  dp_state.solution.best_move(wk, wq, bk, h)     ← the OPTIMAL agent
   │
   └── source = "mc"  →  job.agent.best_move_for(wk, wq, bk)            ← the TRAINED agent
```

The relevant code:

- Frontend: [PlayMode.jsx:117](frontend/src/components/PlayMode.jsx#L117) → [api.js:25](frontend/src/api.js#L25)
- Backend route: [routes.py:88](backend/app/routes.py#L88)

### 1.2 The Optimal (DP) agent

**Where it lives.** It lives in three files on disk, in `backend/app/data/`:

| File | What it contains | Size |
|---|---|---|
| `state_space.pkl` | the list of all 144,508 legal boards, each with a number (board id) | ~3 MB |
| `transitions.pkl` | for every board and every legal White move, where Black can go afterwards | ~335 MB |
| `dp_solution.pkl.npz` | **the agent itself**: a table `PI[h, board] = best move` and `V[h, board] = value` | ~26 MB |

**How it is loaded.** When you start the server (`python run.py`), [jobs.py:311](backend/app/jobs.py#L311) creates `dp_state`. Its method `_try_load_cache()` ([jobs.py:46](backend/app/jobs.py#L46)) reads these three files. From then on the optimal agent is in memory.

**How it was created** (only once, the first time, about 3 minutes):

1. [state_space.py:75](backend/app/state_space.py#L75) lists every legal board.
2. [dp_solver.py:35](backend/app/dp_solver.py#L35) `Transitions` works out, for every board and move, all the possible Black replies.
3. [dp_solver.py:110](backend/app/dp_solver.py#L110) `backward_induction` computes the values backwards in time:
   - h = 0: no moves left, so V = −1 everywhere.
   - h = 1: the best move with 1 move left, using the h = 0 values.
   - h = 2: the best move using the h = 1 values …
   - … up to h = 40.

   At every step it stores the best move in `PI` ([dp_solver.py:154](backend/app/dp_solver.py#L154)).

**How it picks a move.** [dp_solver.py:177](backend/app/dp_solver.py#L177) `best_move` does three things:

1. It turns the position (wk, wq, bk) into a board id.
2. It reads `PI[h-1, board_id]`.
3. It returns that move.

That is the whole agent: **a lookup in a precomputed table**. No search and no randomness happen during the game.

> If you delete `backend/app/data/`, the optimal agent disappears. Click "Solve DP" in the Explore tab and it is rebuilt from scratch in about 3 minutes.

### 1.3 The trained agents (MC and TD)

**Where they live.** You create one with **Start training** in Live Training. By default it trains **in your browser** (a Web Worker) and is saved there (IndexedDB), so it survives reloads and works on the hosted site. With a local or long-running server you can also train on the server (**Run on: Server**); those agents live in the server's memory and disappear when it restarts.

**The algorithm is the report's** ([engine.js](frontend/src/lib/engine.js), and [tabular.py](backend/app/tabular.py) on the server):

- **Five methods:** MC (mean, 1/N), MC (constant α), SARSA, Expected SARSA, Q-learning.
- **State:** board **and moves left h**. The Q-table key is `(h − 1) × 499,496 + shared(board, move)`. The 8 board symmetries are shared; the deadline never is. That makes 19,979,840 entries.
- **Protocol:**
  - every episode starts from a random legal board and a random h in 1…40;
  - ε = max(0.02, (1 + D/10,000)^−½) after D decisions, fixed within an episode;
  - Q0 = 0, α = 0.10 (1/N for MC mean);
  - the budget is counted in **decisions**, as in the report.
- **Updates:**
  - MC waits for the end of the game and moves each Q toward the actual return G.
  - SARSA, Expected SARSA and Q-learning update after every move toward r + γ·(estimated value of what follows).
  - At a terminal move (mate, stalemate, queen lost, deadline) the target is just r.

**How it picks a move:** it reads the Q-values of the legal moves at the current h and plays the highest (first maximum). A move it has **never tried** keeps Q0 = 0.

**Does it match the report?** Yes. With the report's 20-million-decision budget (about a minute in the browser):

| | Return | Mates |
|---|---|---|
| Q-learning — this app | 0.55–0.57 | ≈ 93 % |
| Q-learning — report | 0.5567 | 92.88 % |
| MC constant — this app | 0.407 | 89.7 % |
| MC constant — report | 0.4016 | 89.60 % |

---

## 2. Optimal (DP) vs learned (MC / TD)

| | **Optimal (DP)** | **Learned (MC / TD)** |
|---|---|---|
| Idea | **Planning**: compute the answer from the rules | **Learning**: discover the answer by playing |
| Needs the model (all Black replies and their probabilities)? | **Yes** | **No**, it only sees the games it plays |
| What it stores | V\*(s, h) and π\*(s, h) for all 144,508 boards × 40 budgets | Q(s, h, a) for 499,496 symmetry-shared (board, move) pairs × 40 budgets |
| How values are obtained | 40 exact Bellman sweeps (backward induction) | Sampled returns (MC) or bootstrapped targets (TD) |
| Exact? | **Yes**: the true optimum | **No**: estimates that improve with experience |
| Cost | ~3 min once | 20 million decisions per run in the report (~1 min in the browser) |
| Result | v\* = 0.9271, 100 % mates, 4.70 moves | Report, Q-learning: 0.5567, 92.88 % mates, 18.95 moves |
| Role in the project | The **ground truth** (the answer key) | The **students** being graded against it |

DP cannot be beaten on average. The learners try to get close without knowing the model. Why learn at all, if DP is exact? Most real problems are too big to enumerate, or nobody knows the model. KQvK is small, so we can compute the exact answer and use it to **check** the learners.

---

## 3. Explore values (the Q-table) — what you are looking at

Pick a position: load an **Example**, type the three squares, or switch "Board clicks" to **Set up** and click squares. Every square White can legally reach gets a **coloured tag**. The tag tells you how good that move is, translated into **"mate in N"**:

| Tag | Meaning | Underlying value q(s, a) |
|---|---|---|
| **M1** | the move checkmates immediately | 1.00 |
| **M2** | forced mate on the next move | 0.98 (= −0.01 + 0.99 × 1) |
| **≈M3, ≈M4…** | about 3, 4… moves to mate on average (Black's replies are random) | 0.96, 0.94… |
| **✗** | blunder: stalemate, queen lost or timeout likely | ≤ 0 |
| **?** | (Monte Carlo only) the agent never tried this move | — |

The conversion is exact: a mate on White's n-th move is worth q = 2·0.99ⁿ⁻¹ − 1. Hover a tag to see the raw value.

**Colours compare each move with the best move of the same position:** dark green = best, light green = about one move slower, orange = clearly slower, red = blunder, grey = never tried. **The agent's policy is simply "play a dark-green tag".** The small ♔/♕ in the corner of a tag shows which piece moves there.

**Playing through:** in "Play moves" mode, click your king or queen to see only its moves, then click a tag (or a row in the list) to play it. Black replies at random and every tag is recomputed for the new position. **Undo** takes the move back.

**Values from:**
- **Exact (DP):** the true values (the answer key). ★ marks every optimal move — ties are common: from Kc6, Qe4 vs Ka8, **6 moves** all force mate in 2. "Moves left" (h) matters here.
- **Learned:** a trained agent's estimates (MC or TD) at the chosen h, with how many times each move was tried.
- **Compare:** true and learned values side by side, plus a sentence saying whether the agent's chosen move is optimal.

Good examples to load: "Trap" (Ke1, Qd1 vs Ke8 — Qd7 and Qd8 hang the queen, shown ✗) and "Mate in 1 next to a stalemate trap" (Kf6, Qa7 vs Kh8 — Qg7 mates, Qf7 stalemates).

---

## 4. Results — what you are looking at

1. **Your session:** your finished games and the agents you trained, saved in this browser.
2. **Bar charts (reference):** mate rate and mean return for:
   - random play;
   - "safe" random (mate-in-one if possible, otherwise a move that neither stalemates nor hangs the queen);
   - MC (constant) and Q-learning from the report's comparison;
   - the optimal policy.
3. **"Are the report's numbers right?":** the server recomputes the baselines and π\* **exactly** on all 144,508 starting boards and puts a ✓ when they match the report.
4. **Final MC/TD comparison:** the report's table (5 methods, 20 million decisions × 3 seeds), with Q-learning selected.
5. **Cards:** the MDP numbers and the report's training protocol.

The earlier "100 million games" Monte Carlo figure is **no longer shown**: the report found no logs supporting it.

What "exactly recomputed" means: the DP's backward calculation, but **averaging over the moves the policy would play** instead of taking the best one. That gives the exact expected return of *any* policy, with no sampling ([policy_eval.py](backend/app/policy_eval.py)).

---

## 5. Live Training — what you are looking at

Choose a **method** and a **budget** (Quick demo = 2 M decisions, a few seconds; Report budget = 20 M, about a minute), then **Start training**. The chart shows:

- **Line:** the average return of the last 500 training episodes. It is noisy, because the agent explores and episodes start with a random h.
- **Green dots:** tests of the greedy policy from h = 40, every 10 % of the run. In the browser they use 5,000 fixed games (an estimate, ±0.01); on the server, an exact evaluation on all 144,508 boards.
- **Dotted line:** the report's result for this method at 20 M decisions, for comparison.

Early in training, every method is still poor. The report observes the same thing at 1 and 5 million decisions.

Each run appears in the agent picker of **Play** and **Explore** once its first checkpoint is saved (10 % of the run). If there is no agent yet, those pages show a **Train an agent** button that opens this page.

---

## 6. One-sentence summary

The **agent** is White. It always plays "the move with the highest value in its table". With **Optimal (DP)**, that table was computed exactly from the rules and loaded from `backend/app/data/` at server start. With a **trained agent** (MC or TD), the table was learned by playing games in Live Training — usually in your browser, where it is saved. The **Black king** is never an agent: it just moves at random.

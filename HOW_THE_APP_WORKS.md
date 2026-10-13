# How the app works: the agent, the 4 modes, DP vs Monte Carlo

This file answers five questions:

1. What is the agent in **Play**, and where does it come from?
2. What does **Explore Q-table** show?
3. What does the **Results Dashboard** show?
4. What is the difference between **Optimal (DP)** and **Trained (Monte Carlo)**?
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

### 1.3 The Trained (Monte Carlo) agent

**Where it lives.** It lives **in the server's memory (RAM) only**. It is created when you click **Start training** in Live Training. Each run is a "job" with an id, and each job holds one `MCAgent`. **If you restart the server, all trained agents are lost.** You then have to train again.

**How it is created.** [mc_agent.py:75](backend/app/mc_agent.py#L75) `run_episode` runs once per training game:

1. Start from a random board.
2. White plays ε-greedy: 95 % of the time the move with the highest Q, 5 % of the time a random legal move. Black plays randomly. The game runs until it ends.
3. Compute the actual return G that followed each move.
4. Move each Q-value a little bit (α = 0.01) toward that G: `Q ← Q + α (G − Q)` ([mc_agent.py:121](backend/app/mc_agent.py#L121)).

The Q-table is a Python dictionary. A key is (position up to the 8 board symmetries, piece, destination), and its value is the estimated Q.

**How it picks a move.** [mc_agent.py:126](backend/app/mc_agent.py#L126) `best_move_for` → [mc_agent.py:56](backend/app/mc_agent.py#L56) `greedy_move` does three things:

1. It looks up the Q-value of every legal move.
2. It takes the highest one. Ties are broken at random.
3. A move it has **never tried** still has its starting value Q0 (+1 with the report's settings). That is why a barely-trained agent loves untried moves.

---

## 2. Optimal (DP) vs Trained (Monte Carlo)

| | **Optimal (DP)** | **Trained (Monte Carlo)** |
|---|---|---|
| Idea | **Planning**: compute the answer from the rules | **Learning**: discover the answer by playing |
| Needs the model (all Black replies and their probabilities)? | **Yes** | **No**, it only sees the games it plays |
| What it stores | V\*(s, h) and π\*(s, h) for all 144,508 boards × 40 budgets | Q(s, a) for ~18,081 symmetry classes, **without h** |
| How values are obtained | 40 exact Bellman sweeps (backward induction) | Averages of sampled returns |
| Exact? | **Yes**: the true optimum | **No**: an estimate that improves with more episodes |
| Cost | ~3 min once | Report: 100 million games × 3 seeds (hours) |
| Result | v\* = 0.9271, 100 % mates, 4.70 moves on average | Report (100M games): 0.9022, > 99.99 % mates, 6.02 moves |
| Role in the project | The **ground truth** (the answer key) | The **student** being graded against it |

Two important consequences:

- **DP cannot be beaten on average.** MC tries to get as close to it as possible without knowing the rules of the environment.
- **MC ignores h** (the number of moves left). It plays the same move whether 40 moves or 2 moves are left. DP adapts to h. This is one reason MC stays slightly below DP (0.9022 vs 0.9271).

Why do MC at all, if DP is exact? Most real problems are too big to enumerate, or nobody knows the model. KQvK is small, so we can compute the exact answer and use it to **check** that MC works.

---

## 3. Explore Q-table — what you are looking at

You pick a position: type the squares, or click a square to place a piece. Each legal White destination then gets a **coloured tag with a number**. That number is **q(s, a)**: the expected discounted return if White plays that move now and then keeps playing well.

How to read the numbers:

| Value | Meaning |
|---|---|
| **1.00** | the move checkmates immediately |
| **0.98** | forced mate on the next move (−0.01 + 0.99 × 1) |
| **0.90 – 0.97** | a quick forced mate (a few moves) |
| **around 0 or negative** | a blunder: the queen can be captured, or the move leads to stalemate or a timeout |

Tag colours: green ≥ 0.8, gold between 0 and 0.8, red < 0.

**With source = Exact q\* (DP):**

- These are the **true** values.
- **★ marks every optimal move.** Several moves often share the best value. Example: from Kc6, Qe4 vs Ka8, **6 different moves** all have q\* = 0.98.
- Moves that checkmate or stalemate immediately are flagged.
- "Moves left" (h) matters: the same board can have different values with 40 or 3 moves left.

**With source = Learned Q (Monte Carlo):**

- These are the trained agent's **estimates**, which can be wrong.
- Each move shows **how many times it was tried**. "Never tried" means its value is still the starting value Q0, not something learned.
- "Moves left" is greyed out, because the MC table does not use h.

**Exercise for the presentation:** compare the same position under DP and under MC. You will see how close (or far) the learned values are to the truth.

---

## 4. Results Dashboard — what you are looking at

1. **Bar charts:** mate rate and mean return for four policies:
   - **Uniform random:** any legal move. 1.2 % mates.
   - **Safe random:** take a mate-in-one if there is one; otherwise play a random move that neither stalemates nor leaves the queen en prise. 15.9 % mates.
   - **MC agent:** the report's 100-million-game result. > 99.99 % mates.
   - **Optimal (DP):** 100 % mates.
2. **"Are the report's numbers right?" table:** the server recomputes the random baselines and π\* **exactly** on all 144,508 starting boards, and puts a ✓ when they match the report. All of them match.
3. **Real learning curves:** how good the MC agent's policy actually is after 1k … 500k training games, measured with this app, for three hyperparameter settings.
4. **DP vs MC table:** the same comparison as section 2 above.
5. **Cards** with the MDP numbers (states, budget, γ, rewards) and the report's MC results.

What "exactly recomputed" means: we take the DP's backward calculation, but instead of taking the **best** move we **average over the moves the policy would play**. That gives the exact expected return of *any* policy, with no random sampling. The code is in [policy_eval.py:82](backend/app/policy_eval.py#L82).

---

## 5. Live Training — what you are looking at

You start a training run (100 to 500,000 games). The chart shows two different things:

- **Line (training return):** the average result of the last 500 training games. It includes the 5 % random exploration moves, so it is noisy and a bit pessimistic.
- **Green dots (exact evaluation):** the true quality of what the agent has learned so far. They are computed on all 144,508 boards, with no exploration, so you can compare them directly with v\* = 0.927.

Two presets:

- **Report settings** (α = 0.01, Q0 = +1): the presentation's algorithm. It is slow at first and stays near random for the first ~10,000 games, because every untried move looks perfect (+1). At 500k games it reaches +0.685 (92.5 % mates).
- **Fast demo** (α = 0.1, Q0 = 0): learns visibly within ~30,000 games (+0.41). It explores less, so its mates are slower.

Each finished run appears in the job list of **Play** and **Explore**. You can then play against it, or inspect its Q-values.

---

## 6. One-sentence summary

The **agent** is White. It always plays "the move with the highest value in its table". With **Optimal (DP)**, that table was computed exactly from the rules and loaded from `backend/app/data/` at server start. With **Trained (Monte Carlo)**, the table was learned by playing games in a Live Training job and only lives in the server's memory. The **Black king** is never an agent: it just moves at random.

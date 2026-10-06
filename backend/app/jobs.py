"""
Background job management for the two long-running computations:
  - the exact DP solve (enumerate boards -> build transitions -> backward induction)
  - Monte Carlo training runs (one per "Live Training" session in the UI)

Both run in daemon threads so Flask's request/response cycle never blocks on
them; the frontend polls a /status endpoint to drive a progress bar / live
chart. Everything is guarded by a lock because Flask's dev and prod servers
may both use multiple worker threads.
"""
from __future__ import annotations
import threading
import time
import uuid
from pathlib import Path

from .state_space import StateSpace
from .dp_solver import Transitions, DPSolution, backward_induction, DEFAULT_BUDGET
from .mc_agent import MCAgent

DATA_DIR = Path(__file__).parent / "data"
SPACE_PATH = DATA_DIR / "state_space.pkl"
TRANS_PATH = DATA_DIR / "transitions.pkl"
DP_PATH = DATA_DIR / "dp_solution.pkl"


class DPState:
    """Singleton holding the (possibly still-building) DP solution."""
    def __init__(self):
        self.lock = threading.Lock()
        self.space: StateSpace | None = None
        self.trans: Transitions | None = None
        self.solution: DPSolution | None = None
        self.status = "idle"       # idle | enumerating | building_transitions | solving | ready | error
        self.progress = {"stage": None, "current": 0, "total": 0}
        self.error = None
        self.started_at = None
        self.finished_at = None

        # Try to load from cache immediately (cheap if present).
        self._try_load_cache()

    def _try_load_cache(self):
        if SPACE_PATH.exists():
            try:
                self.space = StateSpace.load(SPACE_PATH)
            except Exception:
                self.space = None
        npz_path = Path(str(DP_PATH) + ".npz")
        if self.space is not None and TRANS_PATH.exists() and npz_path.exists():
            try:
                self.trans = Transitions.load(TRANS_PATH)
                self.solution = DPSolution.load(self.space, self.trans, DP_PATH)
                self.status = "ready"
            except Exception as e:
                self.error = str(e)

    def summary(self):
        with self.lock:
            out = {
                "status": self.status,
                "progress": dict(self.progress),
                "n_boards": len(self.space.boards) if self.space else None,
                "n_representatives": len(self.space.representatives) if self.space else None,
                "budget": self.solution.budget if self.solution else None,
                "v_star_mean": float(self.solution.V[self.solution.budget].mean()) if self.solution else None,
                "error": self.error,
            }
        return out

    def start_solve(self, budget: int = DEFAULT_BUDGET):
        with self.lock:
            if self.status in ("enumerating", "building_transitions", "solving"):
                return False
            if self.solution is not None and self.solution.budget == budget:
                return False  # already solved at this budget
            self.status = "enumerating"
            self.error = None
            self.started_at = time.time()
        t = threading.Thread(target=self._run_solve, args=(budget,), daemon=True)
        t.start()
        return True

    def _run_solve(self, budget):
        try:
            def enum_cb(i, n):
                with self.lock:
                    self.status = "enumerating"
                    self.progress = {"stage": "enumerating boards", "current": i, "total": n}

            if self.space is None:
                self.space = StateSpace.load_or_build(SPACE_PATH, progress_cb=enum_cb)
            with self.lock:
                self.status = "building_transitions"
                self.progress = {"stage": "building transition table", "current": 0, "total": 1}

            if self.trans is None:
                if TRANS_PATH.exists():
                    self.trans = Transitions.load(TRANS_PATH)
                else:
                    self.trans = Transitions(self.space)
                    self.trans.save(TRANS_PATH)

            with self.lock:
                self.status = "solving"
                self.progress = {"stage": "backward induction", "current": 0, "total": budget}

            def bi_cb(h, b):
                with self.lock:
                    self.progress = {"stage": "backward induction", "current": h, "total": b}

            V, PI = backward_induction(self.trans, budget=budget, progress_cb=bi_cb)
            sol = DPSolution(self.space, self.trans, V, PI, budget)
            sol.save(DP_PATH)

            with self.lock:
                self.solution = sol
                self.status = "ready"
                self.finished_at = time.time()
        except Exception as e:
            with self.lock:
                self.status = "error"
                self.error = repr(e)


class TrainingJob:
    def __init__(self, job_id, episodes, alpha, epsilon, q0, budget, seed=None, window=500):
        self.job_id = job_id
        self.episodes_target = episodes
        self.agent = MCAgent(alpha=alpha, epsilon=epsilon, q0=q0, seed=seed)
        self.budget = budget
        self.window = window
        self.lock = threading.Lock()
        self.episodes_done = 0
        self.status = "running"  # running | done | stopped | error
        self.error = None
        self.recent_returns = []
        self.recent_mates = []
        self.curve = []  # list of {episode, mean_return, mate_rate, qtable_size}
        self._stop_flag = False
        self.started_at = time.time()
        self.finished_at = None
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def _run(self):
        try:
            checkpoint_every = max(1, self.episodes_target // 100)
            for i in range(1, self.episodes_target + 1):
                if self._stop_flag:
                    with self.lock:
                        self.status = "stopped"
                    break
                st = self.agent.run_episode(budget=self.budget)
                with self.lock:
                    self.episodes_done = i
                    self.recent_returns.append(st.ret)
                    self.recent_mates.append(1 if st.outcome == "checkmate" else 0)
                    if len(self.recent_returns) > self.window:
                        self.recent_returns.pop(0)
                        self.recent_mates.pop(0)
                    if i % checkpoint_every == 0 or i == self.episodes_target:
                        mr = sum(self.recent_returns) / len(self.recent_returns)
                        mrate = sum(self.recent_mates) / len(self.recent_mates)
                        self.curve.append({
                            "episode": i,
                            "mean_return": mr,
                            "mate_rate": mrate,
                            "qtable_size": self.agent.q_table_size(),
                        })
            else:
                with self.lock:
                    if self.status == "running":
                        self.status = "done"
            with self.lock:
                if self.status == "running":
                    self.status = "done"
                self.finished_at = time.time()
        except Exception as e:
            with self.lock:
                self.status = "error"
                self.error = repr(e)

    def stop(self):
        self._stop_flag = True

    def summary(self):
        with self.lock:
            return {
                "job_id": self.job_id,
                "status": self.status,
                "episodes_done": self.episodes_done,
                "episodes_target": self.episodes_target,
                "qtable_size": self.agent.q_table_size(),
                "curve": list(self.curve),
                "error": self.error,
            }


class JobRegistry:
    def __init__(self):
        self.lock = threading.Lock()
        self.jobs: dict[str, TrainingJob] = {}

    def start(self, episodes, alpha, epsilon, q0, budget, seed=None):
        job_id = uuid.uuid4().hex[:12]
        job = TrainingJob(job_id, episodes, alpha, epsilon, q0, budget, seed=seed)
        with self.lock:
            self.jobs[job_id] = job
        return job_id

    def get(self, job_id) -> TrainingJob | None:
        with self.lock:
            return self.jobs.get(job_id)


dp_state = DPState()
job_registry = JobRegistry()

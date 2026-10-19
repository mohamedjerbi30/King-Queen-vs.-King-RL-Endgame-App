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
import json
import threading
import time
import uuid
from pathlib import Path

from .state_space import StateSpace
from .dp_solver import Transitions, DPSolution, backward_induction, DEFAULT_BUDGET
from .mc_agent import MCAgent
from . import policy_eval

DATA_DIR = Path(__file__).parent / "data"
SPACE_PATH = DATA_DIR / "state_space.pkl"
TRANS_PATH = DATA_DIR / "transitions.pkl"
DP_PATH = DATA_DIR / "dp_solution.pkl"
BASELINES_PATH = DATA_DIR / "baselines_verified.json"


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


class BaselineCheck:
    """Exact evaluation of uniform random, safe random and pi* over all
    144,508 starting boards (~1 min), cached to disk once computed."""
    def __init__(self):
        self.lock = threading.Lock()
        self.status = "idle"  # idle | running | ready | error
        self.result = None
        self.error = None
        if BASELINES_PATH.exists():
            try:
                self.result = json.loads(BASELINES_PATH.read_text())
                self.status = "ready"
            except Exception:
                pass

    def summary(self):
        with self.lock:
            return {"status": self.status, "result": self.result, "error": self.error}

    def start(self):
        with self.lock:
            if self.status in ("running", "ready") or dp_state.solution is None:
                return False
            self.status = "running"
        threading.Thread(target=self._run, daemon=True).start()
        return True

    def _run(self):
        try:
            sol = dp_state.solution
            t, H = sol.trans, sol.budget
            res = {
                "uniform_random": policy_eval.summarise(*policy_eval.evaluate(t, policy_eval.uniform_policy(t), H)),
                "safe_random": policy_eval.summarise(*policy_eval.evaluate(t, policy_eval.safe_random_policy(t), H)),
                "optimal": policy_eval.summarise(*policy_eval.evaluate(
                    t, None, H, weights_for_h=lambda h: policy_eval.optimal_policy_weights(sol, h))),
                "budget": H,
            }
            BASELINES_PATH.write_text(json.dumps(res, indent=1))
            with self.lock:
                self.result, self.status = res, "ready"
        except Exception as e:
            with self.lock:
                self.status, self.error = "error", repr(e)


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
        self.evaluations = []  # exact greedy-policy evaluations, see start_evaluation
        self.eval_status = "idle"
        self._stop_flag = False
        self.started_at = time.time()
        self.finished_at = None
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def _run(self):
        try:
            checkpoint_every = max(25, self.episodes_target // 400)  # ~400 curve points
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
            # Start the exact test BEFORE flagging the run as finished, so a
            # listener never sees "finished and nothing pending" in between.
            self.start_evaluation()  # no-op if the DP solution isn't loaded
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

    def start_evaluation(self):
        """Exactly evaluate the CURRENT greedy policy (no exploration) on all
        144,508 boards against pi*. Runs in the background (~20-30 s)."""
        with self.lock:
            if self.eval_status == "running" or dp_state.solution is None:
                return False
            self.eval_status = "running"
        threading.Thread(target=self._run_evaluation, daemon=True).start()
        return True

    def _run_evaluation(self):
        try:
            sol = dp_state.solution
            episodes = self.episodes_done
            w, coverage = policy_eval.mc_greedy_policy(sol.trans, sol.space, self.agent)
            s = policy_eval.summarise(*policy_eval.evaluate(sol.trans, w, self.budget))
            v_star = float(sol.V[min(self.budget, sol.budget)].mean())
            s.update(
                episodes=episodes,
                coverage=coverage,
                agreement=policy_eval.agreement_with_optimal(sol, w, min(self.budget, sol.budget)),
                v_star=v_star,
                pct_of_optimal=100.0 * s["mean_return"] / v_star,
            )
            with self.lock:
                self.evaluations.append(s)
                self.eval_status = "idle"
        except Exception as e:
            with self.lock:
                self.eval_status = "error"
                self.error = repr(e)

    def summary(self):
        with self.lock:
            return {
                "job_id": self.job_id,
                "status": self.status,
                "episodes_done": self.episodes_done,
                "episodes_target": self.episodes_target,
                "started_at": self.started_at,
                "qtable_size": self.agent.q_table_size(),
                "curve": list(self.curve),
                "evaluations": list(self.evaluations),
                "eval_status": self.eval_status,
                "params": {"alpha": self.agent.alpha, "epsilon": self.agent.epsilon,
                           "q0": self.agent.q0, "budget": self.budget},
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

    def list(self):
        with self.lock:
            jobs = list(self.jobs.values())
        return [{"job_id": j.job_id, "status": j.status, "episodes_done": j.episodes_done,
                 "episodes_target": j.episodes_target, "started_at": j.started_at} for j in jobs]


dp_state = DPState()
job_registry = JobRegistry()
baseline_check = BaselineCheck()

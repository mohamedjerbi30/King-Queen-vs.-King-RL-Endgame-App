import os
import uuid

from flask import Blueprint, jsonify, request

from .chess_engine import (
    Position, sq_name, name_to_sq, white_legal_moves, step as engine_step,
    random_start_position, DEFAULT_BUDGET, GAMMA, STEP_REWARD, WIN_REWARD, LOSS_REWARD,
    kings_adjacent, black_in_check,
)
from .jobs import dp_state, job_registry, baseline_check
from .tabular import METHODS
from .state_space import canonicalize
from .results_data import OFFICIAL_RESULTS

bp = Blueprint("api", __name__, url_prefix="/api")

# Serverless hosts (Vercel, AWS Lambda) run each request in a short-lived,
# possibly different instance: training jobs kept in memory cannot survive
# there. The frontend reads this flag to explain it instead of failing.
SERVERLESS = bool(os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"))
INSTANCE_ID = uuid.uuid4().hex[:8]  # identifies this process in error messages

# LOW_MEMORY=1 (e.g. a free 512 MB instance): keep the exact DP features
# (optimal agent, exact values, the pre-verified baselines) but refuse the
# memory-hungry ones — server training and exact policy tests (~1 GB peaks).
# Agents are then trained in the browser instead.
LOW_MEMORY = os.environ.get("LOW_MEMORY", "").lower() in ("1", "true", "yes")
SERVER_TRAINING = not (SERVERLESS or LOW_MEMORY)
LOW_MEMORY_MSG = "Server training and exact tests are disabled on this low-memory server — train in the browser instead."

UNKNOWN_JOB = (
    "This trained agent does not exist on this server instance. The server was "
    "restarted, or it runs on a serverless host (e.g. Vercel) that cannot keep "
    "training jobs between requests — train again on a long-running server."
)


# ---------------------------------------------------------------- helpers
def _pos_from_request(data):
    return Position(int(data["wk"]), int(data["wq"]), int(data["bk"]), int(data.get("moves_left", DEFAULT_BUDGET)))


def _board_json(pos: Position):
    return {
        "wk": pos.wk, "wq": pos.wq, "bk": pos.bk, "moves_left": pos.moves_left,
        "wk_name": sq_name(pos.wk), "wq_name": sq_name(pos.wq), "bk_name": sq_name(pos.bk),
    }


def _moves_json(moves):
    return [{"piece": p, "dest": d, "dest_name": sq_name(d)} for p, d in moves]


# ---------------------------------------------------------------- meta
@bp.get("/health")
def health():
    return jsonify({"ok": True, "serverless": SERVERLESS, "low_memory": LOW_MEMORY,
                    "server_training": SERVER_TRAINING, "instance": INSTANCE_ID})


@bp.get("/constants")
def constants():
    return jsonify({
        "gamma": GAMMA, "step_reward": STEP_REWARD, "win_reward": WIN_REWARD,
        "loss_reward": LOSS_REWARD, "default_budget": DEFAULT_BUDGET,
        "alpha": 0.1, "q0": 0.0, "epsilon": "max(0.02, (1 + D/10000)^-1/2)", "methods": list(METHODS),
    })


# ---------------------------------------------------------------- play mode
@bp.get("/new_game")
def new_game():
    budget = int(request.args.get("budget", DEFAULT_BUDGET))
    seed = request.args.get("seed")
    import random
    rng = random.Random(int(seed)) if seed is not None else random.Random()
    pos = random_start_position(rng, budget=budget)
    return jsonify({"position": _board_json(pos), "legal_moves": _moves_json(white_legal_moves(pos))})


@bp.get("/legal_moves")
def legal_moves():
    wk, wq, bk = int(request.args["wk"]), int(request.args["wq"]), int(request.args["bk"])
    pos = Position(wk, wq, bk, 1)
    return jsonify({"legal_moves": _moves_json(white_legal_moves(pos))})


@bp.post("/step")
def do_step():
    data = request.get_json()
    pos = _pos_from_request(data)
    piece = data["piece"]
    dest = int(data["dest"])
    import random
    seed = data.get("seed")
    rng = random.Random(int(seed)) if seed is not None else random.Random()
    res = engine_step(pos, piece, dest, rng)
    out = {
        "reward": res.reward,
        "done": res.done,
        "outcome": res.outcome,
        "black_reply": sq_name(res.black_reply) if res.black_reply is not None else None,
    }
    if res.next_position is not None:
        out["position"] = _board_json(res.next_position)
        out["legal_moves"] = _moves_json(white_legal_moves(res.next_position))
    return jsonify(out)


@bp.get("/agent_move")
def agent_move():
    """Suggests a move for the current position: from the exact DP solution
    if it's ready, else from a training job's learned Q-table, else a
    simple heuristic fallback (closest-to-mate greedy capture-avoidance)."""
    wk, wq, bk = int(request.args["wk"]), int(request.args["wq"]), int(request.args["bk"])
    moves_left = int(request.args.get("moves_left", DEFAULT_BUDGET))
    source = request.args.get("source", "dp")  # dp | mc
    job_id = request.args.get("job_id")

    if source == "dp" and dp_state.solution is not None:
        mv = dp_state.solution.best_move(wk, wq, bk, moves_left)
        if mv is None:
            return jsonify({"error": "no legal move / state not found"}), 404
        piece, dest = mv
        val = dp_state.solution.value(wk, wq, bk, moves_left)
        return jsonify({"piece": piece, "dest": dest, "dest_name": sq_name(dest), "source": "dp", "value": val})

    if source == "mc" and job_id:
        job = job_registry.get(job_id)
        if job is None:
            return jsonify({"error": UNKNOWN_JOB, "code": "unknown_job", "instance": INSTANCE_ID}), 404
        (piece, dest), val = job.agent.best_move(wk, wq, bk, moves_left)  # h is part of the state
        return jsonify({"piece": piece, "dest": dest, "dest_name": sq_name(dest), "source": "mc", "value": val})

    return jsonify({"error": "no agent available for the requested source"}), 400


# ---------------------------------------------------------------- DP mode
@bp.get("/dp/status")
def dp_status():
    return jsonify(dp_state.summary())


@bp.post("/dp/solve")
def dp_solve():
    budget = int((request.get_json(silent=True) or {}).get("budget", DEFAULT_BUDGET))
    started = dp_state.start_solve(budget=budget)
    return jsonify({"started": started, "status": dp_state.status})


@bp.get("/dp/query")
def dp_query():
    if dp_state.solution is None:
        return jsonify({"error": "DP solution not ready"}), 409
    wk, wq, bk = int(request.args["wk"]), int(request.args["wq"]), int(request.args["bk"])
    h = max(1, int(request.args.get("moves_left", dp_state.solution.budget)))
    err = _position_error(wk, wq, bk)
    if err:
        return jsonify({"error": err}), 400
    val = dp_state.solution.value(wk, wq, bk, h)
    mv = dp_state.solution.best_move(wk, wq, bk, h)
    piece, dest = mv if mv else (None, None)
    rows = [{"piece": p, "dest": d, "dest_name": sq_name(d), "q": q, "kind": kind}
            for p, d, q, kind in dp_state.solution.q_values(wk, wq, bk, h)]
    rows.sort(key=lambda r: -r["q"])
    best_q = rows[0]["q"] if rows else None
    for r in rows:
        r["optimal"] = abs(r["q"] - best_q) < 1e-9
    return jsonify({
        "value": val,
        "best_move": {"piece": piece, "dest": dest, "dest_name": sq_name(dest)} if mv else None,
        "qvalues": rows,
    })


def _position_error(wk, wq, bk):
    """Human-readable reason a (wk, wq, bk) board is not a White-to-move state, or None."""
    if len({wk, wq, bk}) != 3:
        return "Two pieces are on the same square."
    if kings_adjacent(wk, bk):
        return "The two kings are adjacent — illegal position."
    if black_in_check(wk, wq, bk):
        return "Black is in check, so it would be Black's move — not a White-to-move state."
    return None


@bp.get("/baselines")
def baselines():
    return jsonify(baseline_check.summary())


@bp.post("/baselines/verify")
def baselines_verify():
    if LOW_MEMORY and baseline_check.result is None:
        return jsonify({"error": LOW_MEMORY_MSG}), 503
    if dp_state.solution is None:
        return jsonify({"error": "DP solution not ready"}), 409
    baseline_check.start()
    return jsonify(baseline_check.summary())


# ---------------------------------------------------------------- MC training mode
@bp.post("/train/start")
def train_start():
    if not SERVER_TRAINING:
        return jsonify({"error": LOW_MEMORY_MSG}), 503
    if dp_state.trans is None:
        return jsonify({"error": "server training needs the DP solution (solve it first)"}), 409
    data = request.get_json(silent=True) or {}
    method = data.get("method", "qlearning")
    if method not in METHODS:
        return jsonify({"error": f"unknown method {method!r}"}), 400
    decisions = max(10_000, min(int(data.get("decisions", 1_000_000)), 2_000_000))  # bounded: Python is ~20x slower than the browser
    alpha = float(data.get("alpha", 0.1))
    q0 = float(data.get("q0", 0.0))
    job_id = job_registry.start(method, decisions, alpha, q0, seed=data.get("seed"))
    return jsonify({"job_id": job_id})


@bp.get("/train/status/<job_id>")
def train_status(job_id):
    job = job_registry.get(job_id)
    if job is None:
        return jsonify({"error": UNKNOWN_JOB, "code": "unknown_job", "instance": INSTANCE_ID}), 404
    return jsonify(job.summary())


@bp.post("/train/stop/<job_id>")
def train_stop(job_id):
    job = job_registry.get(job_id)
    if job is None:
        return jsonify({"error": UNKNOWN_JOB, "code": "unknown_job", "instance": INSTANCE_ID}), 404
    job.stop()
    return jsonify({"stopped": True})


@bp.get("/train/jobs")
def train_jobs():
    return jsonify({"jobs": job_registry.list()})


@bp.post("/train/evaluate/<job_id>")
def train_evaluate(job_id):
    if LOW_MEMORY:
        return jsonify({"error": LOW_MEMORY_MSG}), 503
    job = job_registry.get(job_id)
    if job is None:
        return jsonify({"error": UNKNOWN_JOB, "code": "unknown_job", "instance": INSTANCE_ID}), 404
    if dp_state.solution is None:
        return jsonify({"error": "exact evaluation needs the DP solution (solve it first)"}), 409
    job.start_evaluation()
    return jsonify(job.summary())


@bp.get("/train/qtable/<job_id>")
def train_qtable(job_id):
    job = job_registry.get(job_id)
    if job is None:
        return jsonify({"error": UNKNOWN_JOB, "code": "unknown_job", "instance": INSTANCE_ID}), 404
    wk, wq, bk = int(request.args["wk"]), int(request.args["wq"]), int(request.args["bk"])
    err = _position_error(wk, wq, bk)
    if err:
        return jsonify({"error": err}), 400
    h = int(request.args.get("moves_left", 40))
    rows = [{"piece": p, "dest": d, "dest_name": sq_name(d), "q": q, "visits": n}
            for p, d, q, n in job.agent.q_rows(wk, wq, bk, h)]
    rows.sort(key=lambda r: -r["q"])
    (cwk, cwq, cbk), k = canonicalize(wk, wq, bk)
    return jsonify({
        "qvalues": rows,
        "canonical": {"wk": sq_name(cwk), "wq": sq_name(cwq), "bk": sq_name(cbk), "symmetry": k},
    })


# ---------------------------------------------------------------- dashboard mode
@bp.get("/results")
def results():
    return jsonify(OFFICIAL_RESULTS)

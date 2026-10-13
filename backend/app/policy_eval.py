"""
Exact evaluation of ANY White policy on the full 144,508-board MDP, reusing
the DP transition table. Where dp_solver.backward_induction takes a max over
moves, this module takes a policy-weighted average instead, so it yields the
exact v_pi (no sampling noise) together with two extra statistics:

    P_h(b)  probability of eventually delivering mate from board b, h moves left
    M_h(b)  E[ number of White moves * 1{mate} ]  (so M / P = mean moves to mate)

A policy is given as a per-move weight vector w (length trans.n_moves) whose
entries sum to 1 within each board's contiguous move segment. That is enough
to express uniform random, "safe" random, pi* and the greedy policy read off a
Monte Carlo Q-table, so every number on the dashboard can be checked exactly
instead of being copied from the report.
"""
from __future__ import annotations
import numpy as np

from .chess_engine import STEP_REWARD, GAMMA, LOSS_REWARD, DEFAULT_BUDGET
from .state_space import apply_symmetry


def _segment_ids(trans):
    return np.repeat(np.arange(trans.n_boards), np.diff(trans.move_board_start))


def _normalise(trans, mask):
    """Uniform weights over the moves where mask is True, per board. Boards
    where mask selects nothing fall back to uniform over all their moves."""
    seg = _segment_ids(trans)
    mask = mask.astype(np.float64)
    per_board = np.bincount(seg, weights=mask, minlength=trans.n_boards)
    empty = per_board[seg] == 0
    mask = np.where(empty, 1.0, mask)
    per_board = np.bincount(seg, weights=mask, minlength=trans.n_boards)
    return mask / per_board[seg]


def uniform_policy(trans):
    return _normalise(trans, np.ones(trans.n_moves, dtype=bool))


def safe_random_policy(trans):
    """The report's "safe random" baseline: play a mate-in-one when one exists,
    otherwise move uniformly among moves that neither stalemate nor leave the
    queen en prise. (Evaluates exactly to 15.9% mates / mean return -0.729.)"""
    seg = _segment_ids(trans)
    mate = trans.move_kind == 0
    safe = (trans.move_kind == 2) & (trans.move_n_captures == 0)
    has_mate = np.bincount(seg, weights=mate.astype(np.float64), minlength=trans.n_boards)[seg] > 0
    return _normalise(trans, np.where(has_mate, mate, safe))


def optimal_policy_weights(solution, h):
    """pi* at a given remaining budget h (one-hot on the DP argmax)."""
    w = np.zeros(solution.trans.n_moves)
    pi = solution.PI[h - 1]
    w[pi[pi >= 0]] = 1.0
    return w


def mc_greedy_policy(trans, space, agent):
    """Greedy policy of a Monte Carlo Q-table (ties split uniformly). Also
    returns the fraction of (board, move) pairs the table has actually seen."""
    q = np.empty(trans.n_moves)
    seen = np.zeros(trans.n_moves, dtype=bool)
    Q, q0, visits = agent.Q, agent.q0, agent.visit_count
    starts = trans.move_board_start
    pieces = trans.move_piece
    dests = trans.move_dest
    for bid, (wk, wq, bk) in enumerate(space.boards):
        cwk, cwq, cbk, k = agent.canon_board(wk, wq, bk)
        for mi in range(starts[bid], starts[bid + 1]):
            key = (cwk, cwq, cbk, "K" if pieces[mi] == 0 else "Q", apply_symmetry(int(dests[mi]), k))
            q[mi] = Q.get(key, q0)
            seen[mi] = key in visits
    seg = _segment_ids(trans)
    best = np.maximum.reduceat(q, starts[:-1])
    return _normalise(trans, q >= best[seg] - 1e-12), float(seen.mean())


def evaluate(trans, weights, budget: int = DEFAULT_BUDGET, weights_for_h=None):
    """Exact (V, P, M) at h = budget for every board. `weights_for_h(h)` may
    override `weights` for budget-dependent policies such as pi*."""
    n_rep = trans.move_n_replies.astype(np.float64)
    n_cap = trans.move_n_captures.astype(np.float64)
    safe_n_rep = np.where(n_rep == 0, 1.0, n_rep)
    is_mixed = trans.move_kind == 2
    is_mate = (trans.move_kind == 0).astype(np.float64)
    seg = _segment_ids(trans)
    fi, fn = trans.flat_move_idx, trans.flat_next_board

    V = np.full(trans.n_boards, LOSS_REWARD)
    P = np.zeros(trans.n_boards)
    M = np.zeros(trans.n_boards)
    for h in range(1, budget + 1):
        w = weights_for_h(h) if weights_for_h else weights
        sv = np.bincount(fi, weights=V[fn], minlength=trans.n_moves)
        sp = np.bincount(fi, weights=P[fn], minlength=trans.n_moves)
        sm = np.bincount(fi, weights=(P + M)[fn], minlength=trans.n_moves)
        mv = np.where(is_mixed,
                      (n_cap * LOSS_REWARD + (n_rep - n_cap) * STEP_REWARD + GAMMA * sv) / safe_n_rep,
                      trans.move_terminal_val)
        mp = np.where(is_mixed, sp / safe_n_rep, is_mate)
        mm = np.where(is_mixed, sm / safe_n_rep, is_mate)
        V = np.bincount(seg, weights=w * mv, minlength=trans.n_boards)
        P = np.bincount(seg, weights=w * mp, minlength=trans.n_boards)
        M = np.bincount(seg, weights=w * mm, minlength=trans.n_boards)
    return V, P, M


def summarise(V, P, M):
    """Means over a uniform start distribution on all boards."""
    p = float(P.mean())
    return {
        "mean_return": float(V.mean()),
        "mate_rate": p,
        "mean_moves_to_mate": float(M.mean() / p) if p > 0 else None,
    }


def agreement_with_optimal(solution, weights, h):
    """Fraction of boards where the policy's chosen move(s) are all optimal
    (q-value within 1e-9 of q* max) at budget h."""
    trans = solution.trans
    q = solution.q_all(h)
    seg = _segment_ids(trans)
    best = np.maximum.reduceat(q, trans.move_board_start[:-1])
    optimal = q >= best[seg] - 1e-9
    bad_mass = np.bincount(seg, weights=weights * (~optimal), minlength=trans.n_boards)
    return float((bad_mass < 1e-12).mean())

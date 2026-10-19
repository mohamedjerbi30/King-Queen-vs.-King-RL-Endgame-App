"""
Tabular learners of the final report — MC (mean), MC (constant alpha), SARSA,
Expected SARSA and Q-learning — with the report's representation and protocol:

  key = (h - 1) * NS + shared(board, action)

where shared() indexes the 499,496 symmetry-shared (board, action) pairs and
h in 1..40 is the remaining budget (never merged away). Training resets to a
uniform valid board and a uniform h; epsilon = max(0.02, (1 + D/10,000)^-1/2)
after D decisions, fixed within an episode; Q0 = 0; terminal targets never
bootstrap. The same algorithm runs in the browser (frontend/src/lib/engine.js).
"""
from __future__ import annotations
import random

import numpy as np

from .chess_engine import GAMMA, Position, random_start_position, step, white_legal_moves

H = 40
METHODS = {
    "mc_mean": "MC (mean, 1/N)",
    "mc_const": "MC (constant α)",
    "sarsa": "SARSA",
    "expected_sarsa": "Expected SARSA",
    "qlearning": "Q-learning",
}


def epsilon_at(decisions: int) -> float:
    return max(0.02, (1.0 + decisions / 10000.0) ** -0.5)


_SYM = [
    lambda f, r: (f, r), lambda f, r: (r, 7 - f), lambda f, r: (7 - f, 7 - r), lambda f, r: (7 - r, f),
    lambda f, r: (7 - f, r), lambda f, r: (f, 7 - r), lambda f, r: (r, f), lambda f, r: (7 - r, 7 - f),
]
_SHARED = None


def shared_index(trans, space):
    """For every move of the DP transition table (same legal-move order as
    white_legal_moves), its index among the 499,496 symmetry-shared pairs."""
    global _SHARED
    if _SHARED is not None:
        return _SHARED
    boards = np.array(space.boards, dtype=np.int64)
    f, r = boards % 8, boards // 8
    codes = []
    for t in _SYM:
        nf, nr = t(f, r)
        sq = nr * 8 + nf
        codes.append(sq[:, 0] * 4096 + sq[:, 1] * 64 + sq[:, 2])
    codes = np.stack(codes, 1)
    k_best, c_best = codes.argmin(1), codes.min(1)  # first minimising symmetry, as in canonicalize()
    seg = np.repeat(np.arange(trans.n_boards), np.diff(trans.move_board_start))
    d = trans.move_dest.astype(np.int64)
    df, dr, kk = d % 8, d // 8, k_best[seg]
    cdest = np.empty_like(d)
    for k, t in enumerate(_SYM):
        m = kk == k
        nf, nr = t(df[m], dr[m])
        cdest[m] = nr * 8 + nf
    key = c_best[seg] * 128 + trans.move_piece.astype(np.int64) * 64 + cdest
    uniq, inv = np.unique(key, return_inverse=True)
    _SHARED = (inv.astype(np.int32), len(uniq))
    return _SHARED


class TabularAgent:
    def __init__(self, method, trans, space, alpha=0.1, q0=0.0, seed=None):
        if method not in METHODS:
            raise ValueError(f"unknown method {method}")
        self.method, self.alpha, self.q0 = method, alpha, q0
        self.trans, self.board_index = trans, space.board_index
        self.move_shared, self.NS = shared_index(trans, space)
        self.Q = np.full(H * self.NS, q0, dtype=np.float32)
        self.N = np.zeros(H * self.NS, dtype=np.uint32)
        self.rng = random.Random(seed)
        self.decisions = 0
        self.episodes = 0

    # ------------------------------------------------------------ helpers
    def _moves(self, wk, wq, bk):
        moves = white_legal_moves(Position(wk, wq, bk, 1))
        lo = int(self.trans.move_board_start[self.board_index[(wk, wq, bk)]])
        return moves, self.move_shared[lo:lo + len(moves)]

    def _pick(self, layer, shared, eps):
        if self.rng.random() < eps:
            return self.rng.randrange(len(shared))
        vals = self.Q[layer + shared]
        best = np.flatnonzero(vals == vals.max())
        return int(best[self.rng.randrange(len(best))])  # uniform among ties

    # ------------------------------------------------------------ training
    def train_episode(self):
        Q, N, NS, alpha, method = self.Q, self.N, self.NS, self.alpha, self.method
        mc = method in ("mc_mean", "mc_const")
        eps = epsilon_at(self.decisions)
        start = random_start_position(self.rng)
        wk, wq, bk, h = start.wk, start.wq, start.bk, self.rng.randint(1, H)
        moves, shared = self._moves(wk, wq, bk)
        a = self._pick((h - 1) * NS, shared, eps)
        keys, rewards = [], []
        ret, disc, steps = 0.0, 1.0, 0
        while True:
            key = (h - 1) * NS + int(shared[a])
            piece, dest = moves[a]
            res = step(Position(wk, wq, bk, h), piece, dest, self.rng)
            steps += 1
            ret += disc * res.reward
            disc *= GAMMA
            if mc:
                keys.append(key)
                rewards.append(res.reward)
            if res.done:
                if not mc:  # terminal target: no bootstrap
                    N[key] += 1
                    Q[key] += alpha * (res.reward - Q[key])
                outcome = res.outcome
                break
            p = res.next_position
            wk, wq, bk, h = p.wk, p.wq, p.bk, p.moves_left
            moves, shared = self._moves(wk, wq, bk)
            layer = (h - 1) * NS
            if mc:
                a = self._pick(layer, shared, eps)
                continue
            vals = Q[layer + shared]
            if method == "qlearning":
                cont, a = float(vals.max()), self._pick(layer, shared, eps)
            elif method == "expected_sarsa":
                cont = (1 - eps) * float(vals.max()) + eps * float(vals.mean())
                a = self._pick(layer, shared, eps)
            else:  # SARSA: sample a' now and play it next
                a = self._pick(layer, shared, eps)
                cont = float(vals[a])
            N[key] += 1
            Q[key] += alpha * (res.reward + GAMMA * cont - Q[key])
        if mc:  # h decreases every step: first-visit = every-visit
            G = 0.0
            for t in range(len(keys) - 1, -1, -1):
                G = rewards[t] + GAMMA * G
                k = keys[t]
                N[k] += 1
                Q[k] += (1.0 / N[k] if method == "mc_mean" else alpha) * (G - Q[k])
        self.decisions += steps
        self.episodes += 1
        return outcome, ret

    # ------------------------------------------------------------ reading
    def best_move(self, wk, wq, bk, h):
        """Deterministic greedy move (first maximum in legal-move order) and its value."""
        moves, shared = self._moves(wk, wq, bk)
        vals = self.Q[(max(1, min(H, h)) - 1) * self.NS + shared]
        i = int(np.argmax(vals))
        return moves[i], float(vals[i])

    def q_rows(self, wk, wq, bk, h):
        moves, shared = self._moves(wk, wq, bk)
        keys = (max(1, min(H, h)) - 1) * self.NS + shared
        return [(p, d, float(self.Q[k]), int(self.N[k])) for (p, d), k in zip(moves, keys)]

    def greedy_weights(self, h):
        """One-hot policy over all DP moves at budget h (first maximum per board) for exact evaluation."""
        t = self.trans
        q = self.Q[(h - 1) * self.NS + self.move_shared].astype(np.float64)
        starts = t.move_board_start[:-1]
        seg = np.repeat(np.arange(t.n_boards), np.diff(t.move_board_start))
        best = np.maximum.reduceat(q, starts)
        pos = np.where(q >= best[seg], np.arange(t.n_moves), t.n_moves)
        first = np.minimum.reduceat(pos, starts)
        w = np.zeros(t.n_moves)
        w[first] = 1.0
        return w

    def coverage(self):
        return float((self.N > 0).mean())

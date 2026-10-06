"""
First-visit Monte Carlo control with a constant step size, exactly as
described in the project report:

    control method   first-visit Monte Carlo control
    update rule      constant alpha = 0.01 (not 1/N)
    exploration      epsilon-greedy, epsilon = 0.05, fixed
    initial Q        Q0 = +1 (optimistic initialisation)
    Q-table indexing symmetry-reduced (8-fold board symmetry)

The Q-table is a plain dict keyed by (canonical_wk, canonical_wq,
canonical_bk, piece, canonical_dest) -> float, grown lazily as states are
visited (there is no need to pre-allocate all ~18,081 x ~20 entries up
front). A board's canonical symmetry transform k is computed ONCE per
decision point (not once per candidate move) — every legal move from that
board shares the same k, so only its destination square needs transforming.
"""
from __future__ import annotations
import random
from dataclasses import dataclass

from .chess_engine import (
    Position, white_legal_moves, step, random_start_position, DEFAULT_BUDGET, GAMMA,
)
from .state_space import canonicalize, apply_symmetry

ALPHA = 0.01
EPSILON = 0.05
Q0 = 1.0


@dataclass
class EpisodeStats:
    outcome: str
    length: int
    ret: float  # G_0 for this episode


class MCAgent:
    def __init__(self, alpha: float = ALPHA, epsilon: float = EPSILON, q0: float = Q0, seed: int = None):
        self.alpha = alpha
        self.epsilon = epsilon
        self.q0 = q0
        self.Q: dict = {}
        self.visit_count: dict = {}
        self.rng = random.Random(seed)

    def canon_board(self, wk, wq, bk):
        (cwk, cwq, cbk), k = canonicalize(wk, wq, bk)
        return cwk, cwq, cbk, k

    def q_canon(self, cwk, cwq, cbk, k, piece, dest) -> float:
        cdest = apply_symmetry(dest, k)
        return self.Q.get((cwk, cwq, cbk, piece, cdest), self.q0)

    def greedy_move(self, wk, wq, bk, moves):
        cwk, cwq, cbk, k = self.canon_board(wk, wq, bk)
        best_val = None
        best = []
        for piece, dest in moves:
            v = self.q_canon(cwk, cwq, cbk, k, piece, dest)
            if best_val is None or v > best_val:
                best_val = v
                best = [(piece, dest)]
            elif v == best_val:
                best.append((piece, dest))
        return self.rng.choice(best), best_val

    def select_action(self, wk, wq, bk, moves):
        if self.rng.random() < self.epsilon:
            return self.rng.choice(moves)
        move, _ = self.greedy_move(wk, wq, bk, moves)
        return move

    def run_episode(self, budget: int = DEFAULT_BUDGET) -> EpisodeStats:
        pos = random_start_position(self.rng, budget=budget)
        trajectory = []  # list of (canon_key, reward)
        length = 0
        while True:
            moves = white_legal_moves(pos)
            cwk, cwq, cbk, k = self.canon_board(pos.wk, pos.wq, pos.bk)
            if self.rng.random() < self.epsilon:
                piece, dest = self.rng.choice(moves)
            else:
                best_val = None
                best = []
                for p, d in moves:
                    v = self.q_canon(cwk, cwq, cbk, k, p, d)
                    if best_val is None or v > best_val:
                        best_val = v
                        best = [(p, d)]
                    elif v == best_val:
                        best.append((p, d))
                piece, dest = self.rng.choice(best)
            key = (cwk, cwq, cbk, piece, apply_symmetry(dest, k))
            res = step(pos, piece, dest, self.rng)
            length += 1
            trajectory.append((key, res.reward))
            if res.done:
                outcome = res.outcome
                break
            pos = res.next_position

        # Backward pass: G_t = r_t + gamma * G_{t+1}, computed once per step.
        returns_suffix = [0.0] * len(trajectory)
        running = 0.0
        for t in range(len(trajectory) - 1, -1, -1):
            _, reward = trajectory[t]
            running = reward + GAMMA * running
            returns_suffix[t] = running
        G0 = returns_suffix[0] if returns_suffix else 0.0

        # First-visit updates: only the first occurrence of each key in the
        # episode gets updated, using the return from that point on.
        done_keys = set()
        for t, (key, reward) in enumerate(trajectory):
            if key in done_keys:
                continue
            done_keys.add(key)
            old = self.Q.get(key, self.q0)
            self.Q[key] = old + self.alpha * (returns_suffix[t] - old)
            self.visit_count[key] = self.visit_count.get(key, 0) + 1

        return EpisodeStats(outcome=outcome, length=length, ret=G0)

    def best_move_for(self, wk, wq, bk):
        pos = Position(wk, wq, bk, 1)
        moves = white_legal_moves(pos)
        if not moves:
            return None, None
        move, val = self.greedy_move(wk, wq, bk, moves)
        return move, val

    def q_table_size(self):
        return len(self.Q)

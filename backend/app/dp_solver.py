"""
Exact solver for the King+Queen vs King MDP by backward induction on the
remaining move budget h = 1..H. This is a finite-horizon MDP (the budget is
part of the state), so value iteration is replaced by a clean backward
sweep: V_0 == -1 everywhere (running out of moves is a loss), and

    V_h(board) = max over legal White moves of:
        +1                                            if the move mates
        -1                                            if the move stalemates
        avg over Black's uniform replies of:
            -1                               if that reply captures the queen
            STEP_REWARD + GAMMA * V_{h-1}(next_board)  otherwise

The transition structure (which moves are legal, which are immediately
terminal, which boards each surviving reply leads to) depends only on the
board, not on h, so it is built once and reused for every sweep. The sweep
itself is vectorized with numpy (bincount + reduceat) so solving the full
budget is seconds, not hours.
"""
from __future__ import annotations
import pickle
from array import array
import time
from pathlib import Path
import numpy as np

from .chess_engine import (
    white_legal_moves, classify_after_white_move, black_king_moves,
    Position, STEP_REWARD, GAMMA, WIN_REWARD, LOSS_REWARD, DEFAULT_BUDGET,
)
from .state_space import StateSpace

CACHE_PATH = Path(__file__).parent / "data" / "dp_solution.pkl"


class Transitions:
    """Flat, vectorization-friendly transition structure, board-move indexed."""

    def __init__(self, space: StateSpace):
        self.space = space
        n_boards = len(space.boards)
        self.n_boards = n_boards

        move_board_start = np.zeros(n_boards + 1, dtype=np.int64)
        move_piece = []       # 'K' or 'Q' per move (for policy readout)
        move_dest = []        # destination square per move
        move_kind = []        # 0 = checkmate, 1 = stalemate, 2 = mixed/ongoing
        move_terminal_val = []  # +1/-1 for kind 0/1, 0.0 placeholder otherwise
        move_n_replies = []
        move_n_captures = []
        # 16M entries each: typed arrays (4 bytes per entry) instead of Python
        # lists of ints (~36 bytes each), so building fits in little memory.
        flat_move_idx = array("i")
        flat_next_board = array("i")

        mi = 0
        for bid, (wk, wq, bk) in enumerate(space.boards):
            pos = Position(wk, wq, bk, 1)
            for piece, dest in white_legal_moves(pos):
                nwk, nwq = (dest, wq) if piece == "K" else (wk, dest)
                outcome = classify_after_white_move(nwk, nwq, bk)
                if outcome == "checkmate":
                    move_kind.append(0); move_terminal_val.append(WIN_REWARD)
                    move_n_replies.append(0); move_n_captures.append(0)
                elif outcome == "stalemate":
                    move_kind.append(1); move_terminal_val.append(LOSS_REWARD)
                    move_n_replies.append(0); move_n_captures.append(0)
                else:
                    replies = black_king_moves(nwk, nwq, bk)
                    n_cap = 0
                    for r in replies:
                        if r == nwq:
                            n_cap += 1
                        else:
                            nb_id = space.board_index[(nwk, nwq, r)]
                            flat_move_idx.append(mi)
                            flat_next_board.append(nb_id)
                    move_kind.append(2); move_terminal_val.append(0.0)
                    move_n_replies.append(len(replies)); move_n_captures.append(n_cap)
                move_piece.append(0 if piece == "K" else 1)
                move_dest.append(dest)
                mi += 1
            move_board_start[bid + 1] = mi

        self.n_moves = mi
        self.move_board_start = move_board_start
        self.move_piece = np.array(move_piece, dtype=np.int8)
        self.move_dest = np.array(move_dest, dtype=np.int8)
        self.move_kind = np.array(move_kind, dtype=np.int8)
        self.move_terminal_val = np.array(move_terminal_val, dtype=np.float64)
        self.move_n_replies = np.array(move_n_replies, dtype=np.int32)
        self.move_n_captures = np.array(move_n_captures, dtype=np.int32)
        self.flat_move_idx = np.frombuffer(flat_move_idx, dtype=np.int32).copy()
        self.flat_next_board = np.frombuffer(flat_next_board, dtype=np.int32).copy()
        del flat_move_idx, flat_next_board
        self.compact()

    def compact(self):
        """Store every array in the smallest dtype that holds its values
        (indices < 4M -> int32, small counts and +-1 rewards -> int8). Same
        numbers, about 40% of the memory: lets the server fit a 512 MB host."""
        self.flat_move_idx = self.flat_move_idx.astype(np.int32, copy=False)
        self.flat_next_board = self.flat_next_board.astype(np.int32, copy=False)
        self.move_terminal_val = self.move_terminal_val.astype(np.int8, copy=False)
        self.move_n_replies = self.move_n_replies.astype(np.int8, copy=False)
        self.move_n_captures = self.move_n_captures.astype(np.int8, copy=False)
        return self

    def save(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "wb") as f:
            pickle.dump(self.__dict__, f)

    @classmethod
    def load(cls, path: Path):
        obj = cls.__new__(cls)
        with open(path, "rb") as f:
            obj.__dict__.update(pickle.load(f))
        return obj.compact()  # caches written before compaction are converted on load


def build_transitions(space: StateSpace, progress_cb=None) -> Transitions:
    return Transitions(space)


def backward_induction(trans: Transitions, budget: int = DEFAULT_BUDGET, progress_cb=None):
    """
    Returns (V, PI) where:
      V  is a (budget+1, n_boards) array, V[h, b] = optimal value at board b
         with h White moves remaining (V[0] = -1 everywhere).
      PI is an (budget, n_boards) array of move indices (local to each board's
         move list; resolved to (piece, dest) via trans) — the optimal move
         to play at board b with h moves remaining, for h = 1..budget.
    """
    n_boards = trans.n_boards
    starts = trans.move_board_start
    n_rep = trans.move_n_replies.astype(np.float64)
    n_cap = trans.move_n_captures.astype(np.float64)
    n_noncap = n_rep - n_cap
    is_mixed = trans.move_kind == 2
    terminal_val = trans.move_terminal_val

    V = np.full((budget + 1, n_boards), LOSS_REWARD, dtype=np.float64)
    PI = np.full((budget, n_boards), -1, dtype=np.int64)

    safe_n_rep = np.where(n_rep == 0, 1.0, n_rep)  # avoid div-by-zero on terminal moves

    for h in range(1, budget + 1):
        v_prev = V[h - 1]
        sum_next = np.bincount(trans.flat_move_idx, weights=v_prev[trans.flat_next_board],
                                minlength=trans.n_moves)
        mixed_val = (n_cap * LOSS_REWARD + n_noncap * STEP_REWARD + GAMMA * sum_next) / safe_n_rep
        move_val = np.where(is_mixed, mixed_val, terminal_val)

        # Segment max (and argmax) per board, boards' moves are contiguous.
        v_h = np.maximum.reduceat(move_val, starts[:-1]) if n_boards > 0 else np.array([])
        # reduceat on an empty segment (board with 0 moves, shouldn't happen) repeats
        # the previous value; guard boards with zero legal moves defensively:
        seg_sizes = np.diff(starts)
        v_h = np.where(seg_sizes > 0, v_h, LOSS_REWARD)
        V[h] = v_h

        # argmax per segment via a manual scan (only needed to reconstruct the
        # policy; done every h since the policy can differ per remaining budget).
        pi_h = np.full(n_boards, -1, dtype=np.int64)
        nz = np.nonzero(seg_sizes > 0)[0]
        for b in nz:
            s, e = starts[b], starts[b + 1]
            pi_h[b] = s + np.argmax(move_val[s:e])
        PI[h - 1] = pi_h

        if progress_cb:
            progress_cb(h, budget)

    return V, PI


class DPSolution:
    def __init__(self, space: StateSpace, trans: Transitions, V: np.ndarray, PI: np.ndarray, budget: int):
        self.space = space
        self.trans = trans
        self.V = V
        self.PI = PI
        self.budget = budget

    def value(self, wk, wq, bk, h):
        bid = self.space.board_index.get((wk, wq, bk))
        if bid is None:
            return None
        h = min(h, self.budget)
        return float(self.V[h, bid])

    def best_move(self, wk, wq, bk, h):
        bid = self.space.board_index.get((wk, wq, bk))
        if bid is None:
            return None
        h = min(h, self.budget)
        mi = self.PI[h - 1, bid]
        if mi < 0:
            return None
        piece = "K" if self.trans.move_piece[mi] == 0 else "Q"
        dest = int(self.trans.move_dest[mi])
        return piece, dest

    def _move_values(self, h, lo=0, hi=None):
        """q*_h for moves lo..hi (flat move indices): one Bellman backup from V[h-1]."""
        t = self.trans
        hi = t.n_moves if hi is None else hi
        h = min(h, self.budget)
        if lo == 0 and hi == t.n_moves:
            sum_next = np.bincount(t.flat_move_idx, weights=self.V[h - 1][t.flat_next_board],
                                   minlength=t.n_moves)
        else:
            a, b = np.searchsorted(t.flat_move_idx, [lo, hi])
            sum_next = np.bincount(t.flat_move_idx[a:b] - lo,
                                   weights=self.V[h - 1][t.flat_next_board[a:b]], minlength=hi - lo)
        n_rep = t.move_n_replies[lo:hi].astype(np.float64)
        n_cap = t.move_n_captures[lo:hi].astype(np.float64)
        mixed = (n_cap * LOSS_REWARD + (n_rep - n_cap) * STEP_REWARD + GAMMA * sum_next) \
            / np.where(n_rep == 0, 1.0, n_rep)
        return np.where(t.move_kind[lo:hi] == 2, mixed, t.move_terminal_val[lo:hi])

    def q_all(self, h):
        return self._move_values(h)

    def q_values(self, wk, wq, bk, h):
        """[(piece, dest, q*_h(s, a), kind)] for every legal White move of a board,
        kind in {'checkmate', 'stalemate', 'ongoing'}."""
        bid = self.space.board_index.get((wk, wq, bk))
        if bid is None:
            return None
        lo, hi = int(self.trans.move_board_start[bid]), int(self.trans.move_board_start[bid + 1])
        q = self._move_values(h, lo, hi)
        kinds = ("checkmate", "stalemate", "ongoing")
        return [("K" if self.trans.move_piece[m] == 0 else "Q", int(self.trans.move_dest[m]),
                 float(q[m - lo]), kinds[self.trans.move_kind[m]]) for m in range(lo, hi)]

    def save(self, path: Path = CACHE_PATH):
        path.parent.mkdir(parents=True, exist_ok=True)
        # float32 values (7 significant digits) and int32 move indices: half the size.
        np.savez_compressed(str(path) + ".npz", V=self.V.astype(np.float32), PI=self.PI.astype(np.int32), budget=self.budget)

    @classmethod
    def load(cls, space: StateSpace, trans: Transitions, path: Path = CACHE_PATH):
        d = np.load(str(path) + ".npz")
        return cls(space, trans, d["V"].astype(np.float32, copy=False), d["PI"].astype(np.int32, copy=False), int(d["budget"]))


def solve(budget: int = DEFAULT_BUDGET, progress_cb=None) -> DPSolution:
    t0 = time.time()
    space = StateSpace.load_or_build(progress_cb=lambda i, n: progress_cb and progress_cb("enumerate", i, n))
    trans = build_transitions(space)
    V, PI = backward_induction(trans, budget=budget, progress_cb=lambda h, b: progress_cb and progress_cb("backward_induction", h, b))
    sol = DPSolution(space, trans, V, PI, budget)
    print(f"DP solve done in {time.time()-t0:.1f}s")
    return sol

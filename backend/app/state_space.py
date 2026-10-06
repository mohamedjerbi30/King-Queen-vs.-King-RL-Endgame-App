"""
Enumerates every valid (wk, wq, bk) board placement for the King+Queen vs
King endgame (~144,508 configurations), and builds the 8-fold board-symmetry
reduction used by the Monte Carlo Q-table (~18,081 representative classes).

This module is pure board combinatorics — it does not know about move
budgets or rewards. chess_engine.py owns the rules; this module owns the
indexing used by the DP solver and the MC agent so both can work with dense
integer arrays instead of python tuples.
"""
from __future__ import annotations
import pickle
from pathlib import Path
from .chess_engine import is_valid_placement, black_in_check

CACHE_PATH = Path(__file__).parent / "data" / "state_space.pkl"


def _transform(f, r, k):
    """8 symmetries of the square board (dihedral group D4), k in 0..7."""
    if k == 0:
        return f, r
    if k == 1:
        return r, 7 - f
    if k == 2:
        return 7 - f, 7 - r
    if k == 3:
        return 7 - r, f
    if k == 4:
        return 7 - f, r
    if k == 5:
        return f, 7 - r
    if k == 6:
        return r, f
    if k == 7:
        return 7 - r, 7 - f
    raise ValueError(k)


def _apply(sq, k):
    f, r = sq % 8, sq // 8
    nf, nr = _transform(f, r, k)
    return nr * 8 + nf


def apply_symmetry(sq: int, k: int) -> int:
    """Public wrapper: apply symmetry k (0..7) to a single square."""
    return _apply(sq, k)


def canonicalize(wk: int, wq: int, bk: int):
    """
    Returns (canonical_board_tuple, k) where canonical_board_tuple is the
    lexicographically-smallest of the 8 symmetric images of (wk,wq,bk), and k
    is the symmetry index that produces it (apply_symmetry(sq, k) maps the
    original board's squares into the canonical frame).
    """
    best = None
    best_k = 0
    for k in range(8):
        t = (_apply(wk, k), _apply(wq, k), _apply(bk, k))
        if best is None or t < best:
            best = t
            best_k = k
    return best, best_k


class StateSpace:
    def __init__(self):
        self.boards = []            # list of (wk, wq, bk) tuples, index = board_id
        self.board_index = {}       # (wk,wq,bk) -> board_id
        self.canonical_of = None    # np-free list: board_id -> representative board_id
        self.representatives = []   # sorted list of representative board_ids

    def build(self, progress_cb=None):
        boards = []
        index = {}
        for wk in range(64):
            for wq in range(64):
                if wq == wk:
                    continue
                for bk in range(64):
                    if bk == wk or bk == wq:
                        continue
                    if not is_valid_placement(wk, wq, bk):
                        continue
                    # Valid, White to move: Black must not already be in
                    # check (a "White to move" position can never have Black
                    # in check — that would mean it's Black's move instead).
                    if black_in_check(wk, wq, bk):
                        continue
                    key = (wk, wq, bk)
                    index[key] = len(boards)
                    boards.append(key)
            if progress_cb:
                progress_cb(wk + 1, 64)
        self.boards = boards
        self.board_index = index

        n = len(boards)
        canonical_of = [None] * n
        rep_set = []
        for bid, (wk, wq, bk) in enumerate(boards):
            best = None
            for k in range(8):
                t = (_apply(wk, k), _apply(wq, k), _apply(bk, k))
                if best is None or t < best:
                    best = t
            rep_id = index.get(best)
            if rep_id is None:
                # Shouldn't happen (symmetry of a valid board is valid), but
                # guard just in case of an edge transform mismatch.
                rep_id = bid
            canonical_of[bid] = rep_id
        self.canonical_of = canonical_of
        self.representatives = sorted(set(canonical_of))
        return self

    def save(self, path: Path = CACHE_PATH):
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "wb") as f:
            pickle.dump({
                "boards": self.boards,
                "board_index": self.board_index,
                "canonical_of": self.canonical_of,
                "representatives": self.representatives,
            }, f)

    @classmethod
    def load(cls, path: Path = CACHE_PATH):
        with open(path, "rb") as f:
            d = pickle.load(f)
        s = cls()
        s.boards = d["boards"]
        s.board_index = d["board_index"]
        s.canonical_of = d["canonical_of"]
        s.representatives = d["representatives"]
        return s

    @classmethod
    def load_or_build(cls, path: Path = CACHE_PATH, progress_cb=None):
        if path.exists():
            return cls.load(path)
        s = cls().build(progress_cb=progress_cb)
        s.save(path)
        return s

    def board_id(self, wk, wq, bk):
        return self.board_index.get((wk, wq, bk))

    def canonical_id(self, wk, wq, bk):
        bid = self.board_index.get((wk, wq, bk))
        if bid is None:
            return None
        return self.canonical_of[bid]

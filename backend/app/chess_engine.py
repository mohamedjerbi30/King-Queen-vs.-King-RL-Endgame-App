"""
King + Queen vs King endgame engine.

Squares are integers 0..63, file = sq % 8 (a..h), rank = sq // 8 (1..8).
White pieces: King (wk), Queen (wq). Black pieces: King (bk) only.
White always moves first in a transition; Black (if the game continues)
replies uniformly at random among its own legal king moves.

Reward model (fixed, matches the project report):
    +1    White delivers checkmate
    -1    stalemate, queen captured by Black, or move budget exhausted
    -0.01 the episode continues
gamma = 0.99, default move budget = 40 White moves.
"""
from __future__ import annotations
import random
from dataclasses import dataclass
from typing import Optional

FILES = "abcdefgh"
GAMMA = 0.99
STEP_REWARD = -0.01
WIN_REWARD = 1.0
LOSS_REWARD = -1.0
DEFAULT_BUDGET = 40

KING_DELTAS = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
QUEEN_DIRS = KING_DELTAS  # same 8 directions, queen slides


def sq_name(sq: int) -> str:
    return f"{FILES[sq % 8]}{sq // 8 + 1}"


def name_to_sq(name: str) -> int:
    f = FILES.index(name[0])
    r = int(name[1:]) - 1
    return r * 8 + f


def _fr(sq: int):
    return sq % 8, sq // 8


def _in_board(f: int, r: int) -> bool:
    return 0 <= f < 8 and 0 <= r < 8


# Precomputed static move tables (the board never changes shape, so these
# are built once at import time instead of recomputed on every call — this
# is the dominant cost in Monte Carlo training, run millions of times over).
_KING_NEIGHBORS_TBL: list = []
_QUEEN_RAYS_TBL: list = []  # per square: list of rays, each ray a list of squares outward


def _build_tables():
    for sq in range(64):
        f, r = sq % 8, sq // 8
        nbrs = []
        for df, dr in KING_DELTAS:
            nf, nr = f + df, r + dr
            if _in_board(nf, nr):
                nbrs.append(nr * 8 + nf)
        _KING_NEIGHBORS_TBL.append(tuple(nbrs))

        rays = []
        for df, dr in QUEEN_DIRS:
            ray = []
            nf, nr = f + df, r + dr
            while _in_board(nf, nr):
                ray.append(nr * 8 + nf)
                nf += df
                nr += dr
            rays.append(tuple(ray))
        _QUEEN_RAYS_TBL.append(tuple(rays))


_build_tables()


def king_neighbors(sq: int):
    return _KING_NEIGHBORS_TBL[sq]


def queen_attacks(sq: int, blockers: frozenset) -> set:
    """Squares the queen at sq attacks, sliding until (and not past) a blocker."""
    out = set()
    for ray in _QUEEN_RAYS_TBL[sq]:
        for s in ray:
            out.add(s)
            if s in blockers:
                break
    return out


@dataclass(frozen=True)
class Position:
    wk: int
    wq: int
    bk: int
    moves_left: int  # White moves remaining in the budget

    def as_tuple(self):
        return (self.wk, self.wq, self.bk, self.moves_left)


def kings_adjacent(a: int, b: int) -> bool:
    return b in king_neighbors(a)


def is_valid_placement(wk: int, wq: int, bk: int) -> bool:
    if len({wk, wq, bk}) != 3:
        return False
    if kings_adjacent(wk, bk):
        return False
    return True


def white_king_moves(wk: int, wq: int, bk: int):
    """Legal White king destinations: empty of own queen, not adjacent to Black king."""
    out = []
    bk_nb = set(king_neighbors(bk)) | {bk}
    for dest in king_neighbors(wk):
        if dest == wq:
            continue
        if dest in bk_nb:
            continue
        out.append(dest)
    return out


def white_queen_moves(wk: int, wq: int, bk: int):
    """Legal White queen destinations: slide, blocked by own king, cannot land on bk."""
    blockers = frozenset({wk, bk})
    dests = queen_attacks(wq, blockers)
    dests.discard(wk)
    dests.discard(bk)
    return sorted(dests)


def white_legal_moves(pos: Position):
    """Returns list of ((piece, dest)) legal White moves: piece in {'K','Q'}."""
    moves = []
    for d in white_king_moves(pos.wk, pos.wq, pos.bk):
        moves.append(("K", d))
    for d in white_queen_moves(pos.wk, pos.wq, pos.bk):
        moves.append(("Q", d))
    return moves


def squares_attacked_by_white(wk: int, wq: int, bk: int) -> set:
    """Squares attacked by White with the Black king still on the board (used
    to test whether the CURRENT Black king square is in check)."""
    attacked = set(king_neighbors(wk)) | {wk}
    attacked |= queen_attacks(wq, frozenset({wk, bk}))
    return attacked


def _squares_attacked_for_king_move(wk: int, wq: int) -> set:
    """Squares attacked by White when testing where the Black king may MOVE.
    The Black king is not a blocker for its own destination squares — once it
    steps away, a queen's line through its old square can extend further."""
    attacked = set(king_neighbors(wk)) | {wk}
    attacked |= queen_attacks(wq, frozenset({wk}))
    return attacked


def black_king_moves(wk: int, wq: int, bk: int):
    """Legal Black king destinations: not attacked by White, not adjacent to White king."""
    attacked = _squares_attacked_for_king_move(wk, wq)
    out = []
    for dest in king_neighbors(bk):
        if dest == wk:
            continue  # can't capture the king
        if dest in attacked:
            continue
        out.append(dest)
    return out


def black_in_check(wk: int, wq: int, bk: int) -> bool:
    return bk in queen_attacks(wq, frozenset({wk, bk})) or kings_adjacent(wk, bk)


def classify_after_white_move(wk: int, wq: int, bk: int):
    """
    Call right after White's move (before Black acts).
    Returns one of: 'checkmate', 'stalemate', 'ongoing'
    """
    in_check = black_in_check(wk, wq, bk)
    legal = black_king_moves(wk, wq, bk)
    if not legal:
        return "checkmate" if in_check else "stalemate"
    return "ongoing"


def apply_white_move(pos: Position, piece: str, dest: int) -> Position:
    if piece == "K":
        return Position(dest, pos.wq, pos.bk, pos.moves_left)
    else:
        return Position(pos.wk, dest, pos.bk, pos.moves_left)


@dataclass
class StepResult:
    next_position: Optional[Position]
    reward: float
    done: bool
    outcome: Optional[str]  # 'checkmate' | 'stalemate' | 'queen_captured' | 'budget_exhausted' | None
    black_reply: Optional[int] = None  # destination square Black moved to, if any


def step(pos: Position, piece: str, dest: int, rng: random.Random = None) -> StepResult:
    """
    Apply one full RL step: White's move, terminal check, then (if the game
    continues) Black's uniformly-random reply.
    """
    rng = rng or random
    wk, wq, bk = pos.wk, pos.wq, pos.bk
    if piece == "K":
        wk = dest
    else:
        wq = dest

    outcome = classify_after_white_move(wk, wq, bk)
    if outcome == "checkmate":
        return StepResult(None, WIN_REWARD, True, "checkmate")
    if outcome == "stalemate":
        return StepResult(None, LOSS_REWARD, True, "stalemate")

    moves_left = pos.moves_left - 1
    if moves_left <= 0:
        return StepResult(None, LOSS_REWARD, True, "budget_exhausted")

    # Black replies uniformly at random among its legal king moves.
    legal_black = black_king_moves(wk, wq, bk)
    reply = rng.choice(legal_black)
    if reply == wq:
        return StepResult(None, LOSS_REWARD, True, "queen_captured", black_reply=reply)

    next_pos = Position(wk, wq, reply, moves_left)
    return StepResult(next_pos, STEP_REWARD, False, None, black_reply=reply)


def random_start_position(rng: random.Random = None, budget: int = DEFAULT_BUDGET) -> Position:
    rng = rng or random
    while True:
        wk, wq, bk = rng.randrange(64), rng.randrange(64), rng.randrange(64)
        if not is_valid_placement(wk, wq, bk):
            continue
        # A legal White-to-move position: Black is not in check. This is
        # exactly the 144,508-board set the DP solves and the report samples
        # starts from uniformly (Black having no move yet is fine: it is
        # White's turn, and White's move decides mate / stalemate / play on).
        if black_in_check(wk, wq, bk):
            continue
        return Position(wk, wq, bk, budget)

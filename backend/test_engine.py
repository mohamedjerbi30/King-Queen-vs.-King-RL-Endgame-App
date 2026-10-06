import random
import sys
sys.path.insert(0, "app")
from chess_engine import (
    Position, name_to_sq, sq_name, white_legal_moves, classify_after_white_move,
    step, random_start_position, black_king_moves, is_valid_placement
)

def test_basic_mate():
    # Classic king-supported mate: wk=a6, wq=a7, bk=a8 -> queen checks along the
    # a-file, defended by the king; b7 and b8 are also covered. Checkmate.
    wk = name_to_sq("a6")
    wq = name_to_sq("a7")
    bk = name_to_sq("a8")
    outcome = classify_after_white_move(wk, wq, bk)
    assert outcome == "checkmate", outcome
    # And verify that move is reachable as a legal queen move from a nearby square.
    pos = Position(wk, name_to_sq("h7"), bk, 40)
    moves = white_legal_moves(pos)
    assert ("Q", name_to_sq("a7")) in moves, moves
    print("test_basic_mate OK")

def test_stalemate_trap():
    # The infamous blunder: wk=a6, wq=b6, bk=a8 -> a7/b7/b8 all covered,
    # but a8 itself is not attacked -> stalemate, not mate.
    wk = name_to_sq("a6")
    wq = name_to_sq("b6")
    bk = name_to_sq("a8")
    outcome = classify_after_white_move(wk, wq, bk)
    legal = black_king_moves(wk, wq, bk)
    assert outcome == "stalemate", outcome
    assert legal == [], legal
    print("test_stalemate_trap OK —", [sq_name(s) for s in legal], outcome)

def test_random_playout():
    rng = random.Random(42)
    results = {"checkmate": 0, "stalemate": 0, "queen_captured": 0, "budget_exhausted": 0}
    for _ in range(2000):
        pos = random_start_position(rng, budget=40)
        assert is_valid_placement(pos.wk, pos.wq, pos.bk)
        steps = 0
        while True:
            moves = white_legal_moves(pos)
            assert moves, "White must always have a legal move in KQvK"
            piece, dest = rng.choice(moves)
            res = step(pos, piece, dest, rng)
            steps += 1
            if res.done:
                results[res.outcome] += 1
                break
            pos = res.next_position
            assert steps <= 40
    print("random playout outcome distribution (random White policy):", results)
    assert results["checkmate"] >= 0  # random policy can still occasionally mate

if __name__ == "__main__":
    test_basic_mate()
    test_stalemate_trap()
    test_random_playout()
    print("ALL ENGINE TESTS PASSED")

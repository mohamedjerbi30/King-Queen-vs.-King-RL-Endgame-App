"""
Checks the report's headline numbers by exact policy evaluation (needs the
DP cache in app/data/; run the app once or POST /api/dp/solve first).

    python test_policy_eval.py
"""
import sys

from app.jobs import dp_state
from app import policy_eval as pe
from app.chess_engine import GAMMA, STEP_REWARD, WIN_REWARD


def test_returns_slide():
    # Mate on White move n: (n-1) step costs, then +1, discounted by gamma.
    g = lambda n: sum(STEP_REWARD * GAMMA ** k for k in range(n - 1)) + GAMMA ** (n - 1) * WIN_REWARD
    assert abs(g(3) - 0.9602) < 1e-4, g(3)   # the slide said 0.9701 — wrong
    assert abs(g(8) - 0.8641) < 1e-4, g(8)
    print("test_returns_slide OK", round(g(3), 4), round(g(8), 4))


def test_report_numbers():
    sol = dp_state.solution
    t = sol.trans
    checks = [
        ("uniform", pe.uniform_policy(t), None, 0.012, -0.979, None),
        ("safe", pe.safe_random_policy(t), None, 0.159, -0.729, None),
        ("optimal", None, lambda h: pe.optimal_policy_weights(sol, h), 1.0, 0.9271, 4.70),
    ]
    for name, w, wh, mate, ret, moves in checks:
        s = pe.summarise(*pe.evaluate(t, w, sol.budget, weights_for_h=wh))
        assert round(s["mate_rate"], 3) == mate, (name, s)
        assert abs(s["mean_return"] - ret) < 6e-4, (name, s)
        if moves is not None:
            assert round(s["mean_moves_to_mate"], 2) == moves, (name, s)
        print(f"test_report_numbers {name} OK", s)


def test_q_values_match_v():
    sol = dp_state.solution
    for bid in range(0, len(sol.space.boards), 9973):
        wk, wq, bk = sol.space.boards[bid]
        qs = sol.q_values(wk, wq, bk, sol.budget)
        assert abs(max(q for _, _, q, _ in qs) - sol.value(wk, wq, bk, sol.budget)) < 1e-12
    print("test_q_values_match_v OK")


if __name__ == "__main__":
    test_returns_slide()
    if dp_state.solution is None:
        print("DP cache missing — skipping exact-evaluation tests")
        sys.exit(0)
    test_q_values_match_v()
    test_report_numbers()
    print("ALL POLICY-EVAL TESTS PASSED")

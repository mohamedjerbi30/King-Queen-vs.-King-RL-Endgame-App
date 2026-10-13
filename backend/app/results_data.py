"""
Official, previously-measured results from the project report (Sessions
1-3), used by the "Results Dashboard" mode so the app can show the real,
full-scale numbers (100M episodes x 3 seeds) without re-running them live —
that training run took hours on compiled code; this module just documents
what it found. These numbers are exactly reproduced by this project's own
DP solver (see /api/dp/status -> v_star_mean), confirming the two agree.
"""

OFFICIAL_RESULTS = {
    "mdp": {
        "n_states": 144508,
        "n_states_symmetry_reduced": 18081,
        "budget": 40,
        "gamma": 0.99,
        "reward": {"checkmate": 1.0, "failure": -1.0, "step": -0.01},
    },
    "dp_exact": {
        "v_star_mean": 0.927126,
        "mate_rate": 1.0,
        "mean_moves_to_mate": 4.70,
    },
    # uniform_random: any legal move, uniformly.
    # safe_random: mate-in-one if available, else uniform among moves that
    #   neither stalemate nor leave the queen en prise.
    "baselines": {
        "uniform_random": {"mate_rate": 0.012, "mean_return": -0.979},
        "safe_random": {"mate_rate": 0.159, "mean_return": -0.729},
        "optimal": {"mate_rate": 1.0, "mean_return": 0.927126},
    },
    "monte_carlo_final": {
        "episodes_per_seed": 100_000_000,
        "n_seeds": 3,
        "mean_return": 0.9022,
        "mean_return_std": 0.0008,
        "mean_moves_to_mate": 6.02,
        "mean_moves_to_mate_std": 0.04,
        "mate_rate": 0.9999,
        "pct_of_optimal_return": 97.3,
        "algorithm": {
            "method": "first-visit Monte Carlo control",
            "alpha": 0.01,
            "epsilon": 0.05,
            "q0": 1.0,
            "qtable_states": 18081,
        },
    },
    # Measured with THIS app (backend/app/mc_agent.py, seed 1), each point an
    # exact evaluation of the greedy policy over all 144,508 boards
    # (app/policy_eval.py) — the real early part of the learning curve that the
    # report's slide only sketched as "illustrative".
    "app_learning_curve": {
        "report_settings": {"alpha": 0.01, "epsilon": 0.05, "q0": 1.0, "points": [
            {"episodes": 1000, "mean_return": -0.9783, "mate_rate": 0.0123},
            {"episodes": 3000, "mean_return": -0.9771, "mate_rate": 0.0130},
            {"episodes": 10000, "mean_return": -0.9715, "mate_rate": 0.0162},
            {"episodes": 30000, "mean_return": -0.8419, "mate_rate": 0.0898},
            {"episodes": 100000, "mean_return": -0.2616, "mate_rate": 0.4180},
            {"episodes": 300000, "mean_return": 0.1623, "mate_rate": 0.6545},
            {"episodes": 500000, "mean_return": 0.6851, "mate_rate": 0.9254, "mean_moves_to_mate": 10.58},
        ]},
        "fast_demo": {"alpha": 0.1, "epsilon": 0.05, "q0": 0.0, "points": [
            {"episodes": 10000, "mean_return": -0.4925, "mate_rate": 0.2953},
            {"episodes": 30000, "mean_return": 0.4147, "mate_rate": 0.8194},
            {"episodes": 100000, "mean_return": 0.6965, "mate_rate": 0.9735, "mean_moves_to_mate": 15.01},
            {"episodes": 300000, "mean_return": 0.7574, "mate_rate": 0.9936, "mean_moves_to_mate": 13.49},
        ]},
        "alpha_0_1_optimistic": {"alpha": 0.1, "epsilon": 0.05, "q0": 1.0, "points": [
            {"episodes": 10000, "mean_return": -0.9715, "mate_rate": 0.0162},
            {"episodes": 30000, "mean_return": -0.7544, "mate_rate": 0.1403},
            {"episodes": 100000, "mean_return": 0.2579, "mate_rate": 0.7111},
            {"episodes": 300000, "mean_return": 0.7837, "mate_rate": 0.9885, "mean_moves_to_mate": 11.48},
        ]},
    },
}

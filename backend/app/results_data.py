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
}

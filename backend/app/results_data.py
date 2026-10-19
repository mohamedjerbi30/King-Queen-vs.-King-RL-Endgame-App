"""
Reference numbers from the final project report, shown on the Results page.

Only results the report supports with its own measurements are listed: the
exact DP benchmarks (which this app recomputes itself, see /api/baselines)
and the final controlled MC/TD comparison (report Table "Final all-start
comparison": 20 million White decisions per run, seeds 11/23/37, exact
evaluation of every frozen policy on all 144,508 starts). The earlier
"100 million episodes" Monte Carlo claim is deliberately absent: the report
found no logs supporting it.
"""

OFFICIAL_RESULTS = {
    "mdp": {
        "n_states": 144508,
        "n_states_symmetry_reduced": 18081,
        "shared_entries": 499496,       # symmetry-shared (board, action) pairs
        "q_entries": 19979840,          # x 40 budget layers
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
        "minimax": {"mate_rate": 1.0, "mean_return": 0.920689, "mean_moves_to_mate": 5.038},
    },
    "final_comparison": {
        "protocol": {
            "decisions_per_run": 20_000_000,
            "seeds": [11, 23, 37],
            "q0": 0.0,
            "alpha": "1/N (MC mean), 0.10 otherwise",
            "epsilon": "max(0.02, (1 + D/10000)^-1/2), fixed within an episode",
            "training_starts": "uniform valid board and uniform h in 1..40",
            "evaluation": "exact, all 144,508 boards at h = 40",
        },
        # mean +- sample SD over the three seeds; certified = share of starts
        # with forced mate against every Black reply; coverage = canonical keys visited
        "methods": [
            {"name": "MC (mean)", "mean_return": 0.3842, "sd": 0.0039, "mate_rate": 0.8766, "moves": 24.92, "certified": 0.0054, "coverage": 0.5049},
            {"name": "MC (constant)", "mean_return": 0.4016, "sd": 0.0018, "mate_rate": 0.8960, "moves": 25.85, "certified": 0.0047, "coverage": 0.5113},
            {"name": "SARSA", "mean_return": 0.5354, "sd": 0.0073, "mate_rate": 0.9223, "moves": 19.64, "certified": 0.0123, "coverage": 0.6140},
            {"name": "Expected SARSA", "mean_return": 0.5544, "sd": 0.0034, "mate_rate": 0.9263, "moves": 18.82, "certified": 0.0135, "coverage": 0.6083},
            {"name": "Q-learning", "mean_return": 0.5567, "sd": 0.0079, "mate_rate": 0.9288, "moves": 18.95, "certified": 0.0124, "coverage": 0.5955},
        ],
        "selected": "Q-learning",
    },
}

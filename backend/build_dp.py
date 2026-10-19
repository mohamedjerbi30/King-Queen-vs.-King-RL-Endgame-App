"""
Precompute the exact DP solution and the baseline check, and write the caches
to app/data/ — run once at image build time so the deployed server starts
instantly instead of solving for ~3 minutes on first use.

    python build_dp.py
"""
import time

from app.jobs import dp_state, baseline_check

t0 = time.time()
if dp_state.solution is None:
    dp_state._run_solve(40)  # synchronous: enumerate, build transitions, backward induction
    if dp_state.status != "ready":
        raise SystemExit(f"DP solve failed: {dp_state.error}")
print(f"DP ready: v* = {dp_state.solution.V[40].mean():.6f} ({time.time() - t0:.0f}s)")

if baseline_check.result is None:
    baseline_check.status = "running"
    baseline_check._run()
print("baselines:", baseline_check.status)

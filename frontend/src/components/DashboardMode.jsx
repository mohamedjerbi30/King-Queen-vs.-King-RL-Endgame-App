import { useEffect, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
} from "recharts";
import { api } from "../api.js";

const COLORS = { navy: "#162A4B", gold: "#CC8A2C", rust: "#B1503E", sage: "#3C6B5C" };

export default function DashboardMode() {
  const [results, setResults] = useState(null);
  const [dpStatus, setDpStatus] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.results().then(setResults).catch((e) => setError(e.message));
    api.dpStatus().then(setDpStatus).catch(() => {});
  }, []);

  if (error) return <div className="card" style={{ color: "var(--rust)" }}>{error}</div>;
  if (!results) return <div className="card">Loading…</div>;

  const { mdp, dp_exact, baselines, monte_carlo_final } = results;

  const mateRateData = [
    { name: "Uniform random", value: baselines.uniform_random.mate_rate * 100 },
    { name: "Safe random", value: baselines.safe_random.mate_rate * 100 },
    { name: "MC agent (100M ep)", value: monte_carlo_final.mate_rate * 100 },
    { name: "Optimal (DP)", value: baselines.optimal.mate_rate * 100 },
  ];

  const returnData = [
    { name: "Uniform random", value: baselines.uniform_random.mean_return },
    { name: "Safe random", value: baselines.safe_random.mean_return },
    { name: "MC agent (100M ep)", value: monte_carlo_final.mean_return },
    { name: "Optimal (DP)", value: baselines.optimal.mean_return },
  ];

  const barColors = [COLORS.rust, COLORS.gold, COLORS.sage, COLORS.navy];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="panel-grid">
        <div className="card">
          <div className="card-title">Mate rate by policy</div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={mateRateData} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
              <CartesianGrid stroke="rgba(22,42,75,0.08)" />
              <XAxis dataKey="name" tick={{ fontSize: 10.5 }} interval={0} />
              <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
              <Tooltip formatter={(v) => `${v.toFixed(1)}%`} />
              <Bar dataKey="value" name="Mate rate">
                {mateRateData.map((_, i) => <Cell key={i} fill={barColors[i]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="card-title">Mean return by policy</div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={returnData} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
              <CartesianGrid stroke="rgba(22,42,75,0.08)" />
              <XAxis dataKey="name" tick={{ fontSize: 10.5 }} interval={0} />
              <YAxis tick={{ fontSize: 11 }} domain={[-1, 1]} />
              <Tooltip formatter={(v) => v.toFixed(3)} />
              <Bar dataKey="value" name="Mean return">
                {returnData.map((_, i) => <Cell key={i} fill={barColors[i]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="panel-grid">
        <div className="card2">
          <div className="card-title">The MDP</div>
          <div className="stat-row"><span className="label">States</span><span className="value">{mdp.n_states.toLocaleString()}</span></div>
          <div className="stat-row"><span className="label">States (symmetry-reduced)</span><span className="value">{mdp.n_states_symmetry_reduced.toLocaleString()}</span></div>
          <div className="stat-row"><span className="label">Move budget</span><span className="value">{mdp.budget}</span></div>
          <div className="stat-row"><span className="label">Discount γ</span><span className="value">{mdp.gamma}</span></div>
          <div className="stat-row"><span className="label">Reward (mate / fail / step)</span><span className="value">+{mdp.reward.checkmate} / {mdp.reward.failure} / {mdp.reward.step}</span></div>
        </div>

        <div className="card2">
          <div className="card-title">Exact DP (π*)</div>
          <div className="stat-row"><span className="label">v* (mean over all states)</span><span className="value">{dp_exact.v_star_mean.toFixed(6)}</span></div>
          <div className="stat-row"><span className="label">Mate rate</span><span className="value">{(dp_exact.mate_rate * 100).toFixed(1)}%</span></div>
          <div className="stat-row"><span className="label">Mean moves to mate</span><span className="value">{dp_exact.mean_moves_to_mate}</span></div>
          {dpStatus && (
            <div className="stat-row">
              <span className="label">This server's DP cache</span>
              <span className="value">
                <span className={`badge ${dpStatus.status === "ready" ? "success" : "pending"}`}>{dpStatus.status}</span>
                {dpStatus.status === "ready" && ` · v*=${dpStatus.v_star_mean.toFixed(6)}`}
              </span>
            </div>
          )}
        </div>

        <div className="card2">
          <div className="card-title">Monte Carlo (final, 100M episodes × 3 seeds)</div>
          <div className="stat-row"><span className="label">Mean return</span><span className="value">{monte_carlo_final.mean_return.toFixed(4)} ± {monte_carlo_final.mean_return_std}</span></div>
          <div className="stat-row"><span className="label">Mean moves to mate</span><span className="value">{monte_carlo_final.mean_moves_to_mate} ± {monte_carlo_final.mean_moves_to_mate_std}</span></div>
          <div className="stat-row"><span className="label">Mate rate</span><span className="value">{(monte_carlo_final.mate_rate * 100).toFixed(2)}%</span></div>
          <div className="stat-row"><span className="label">% of optimal return</span><span className="value">{monte_carlo_final.pct_of_optimal_return}%</span></div>
          <div className="stat-row"><span className="label">α / ε / Q0</span><span className="value">{monte_carlo_final.algorithm.alpha} / {monte_carlo_final.algorithm.epsilon} / {monte_carlo_final.algorithm.q0}</span></div>
        </div>
      </div>

      <div className="key-rule">
        These are the project's official, previously-measured numbers (Sessions 1–3). The DP solver
        bundled with this app reproduces v* exactly from scratch — see "This server's DP cache" above.
        The Live Training tab runs the same algorithm at a much smaller, interactive scale.
      </div>
    </div>
  );
}

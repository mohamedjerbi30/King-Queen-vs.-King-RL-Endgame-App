import { useEffect, useRef, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  LineChart, Line, Legend, ReferenceLine,
} from "recharts";
import { api } from "../api.js";

const COLORS = { navy: "#162A4B", gold: "#CC8A2C", rust: "#B1503E", sage: "#3C6B5C" };

const CURVE_SERIES = [
  { key: "report_settings", name: "α=0.01, Q0=+1 (report)", color: COLORS.navy },
  { key: "alpha_0_1_optimistic", name: "α=0.1, Q0=+1", color: COLORS.gold },
  { key: "fast_demo", name: "α=0.1, Q0=0", color: COLORS.sage },
];

function Check({ report, live, digits = 3, pct = false }) {
  if (live === undefined || live === null) return <span className="badge pending">not checked</span>;
  const fmt = (v) => (pct ? `${(v * 100).toFixed(1)}%` : v.toFixed(digits));
  const ok = fmt(report) === fmt(live); // agrees to the precision the report quotes
  return <span className={`badge ${ok ? "success" : "fail"}`}>{fmt(live)} {ok ? "✓" : "≠"}</span>;
}

export default function DashboardMode() {
  const [results, setResults] = useState(null);
  const [dpStatus, setDpStatus] = useState(null);
  const [baselines, setBaselines] = useState(null);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => {
    api.results().then(setResults).catch((e) => setError(e.message));
    api.dpStatus().then(setDpStatus).catch(() => {});
    api.baselines().then(setBaselines).catch(() => {});
    return () => clearInterval(pollRef.current);
  }, []);

  async function verify() {
    try {
      setBaselines(await api.baselinesVerify());
      clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        const b = await api.baselines();
        setBaselines(b);
        if (b.status !== "running") clearInterval(pollRef.current);
      }, 2000);
    } catch (e) {
      setError(e.message);
    }
  }

  if (error) return <div className="card" style={{ color: "var(--rust)" }}>{error}</div>;
  if (!results) return <div className="card">Loading…</div>;

  const { mdp, dp_exact, baselines: base, monte_carlo_final: mc, app_learning_curve: curves } = results;
  const live = baselines?.status === "ready" ? baselines.result : null;

  const mateRateData = [
    { name: "Uniform random", value: base.uniform_random.mate_rate * 100 },
    { name: "Safe random", value: base.safe_random.mate_rate * 100 },
    { name: "MC agent (100M ep)", value: mc.mate_rate * 100 },
    { name: "Optimal (DP)", value: base.optimal.mate_rate * 100 },
  ];
  const returnData = [
    { name: "Uniform random", value: base.uniform_random.mean_return },
    { name: "Safe random", value: base.safe_random.mean_return },
    { name: "MC agent (100M ep)", value: mc.mean_return },
    { name: "Optimal (DP)", value: base.optimal.mean_return },
  ];
  const barColors = [COLORS.rust, COLORS.gold, COLORS.sage, COLORS.navy];

  // One row per episode count, one column per hyper-parameter setting.
  const byEp = {};
  for (const s of CURVE_SERIES) {
    for (const p of curves[s.key].points) {
      byEp[p.episodes] = { ...(byEp[p.episodes] || { episodes: p.episodes }), [s.key]: p.mean_return };
    }
  }
  const curveData = Object.values(byEp).sort((a, b) => a.episodes - b.episodes);

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

      <div className="card2">
        <div className="card-title">Are the report's numbers right? — exact re-evaluation on this server</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted)" }}>
                <th>Policy</th><th>Definition</th><th>Mate rate (report → live)</th><th>Mean return (report → live)</th><th>Moves to mate</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Uniform random</strong></td>
                <td>any legal move, uniformly</td>
                <td>{(base.uniform_random.mate_rate * 100).toFixed(1)}% → <Check report={base.uniform_random.mate_rate} live={live?.uniform_random.mate_rate} pct /></td>
                <td>{base.uniform_random.mean_return} → <Check report={base.uniform_random.mean_return} live={live?.uniform_random.mean_return} /></td>
                <td>{live ? live.uniform_random.mean_moves_to_mate.toFixed(2) : "—"}</td>
              </tr>
              <tr>
                <td><strong>Safe random</strong></td>
                <td>mate-in-one if available, else random among moves that neither stalemate nor hang the queen</td>
                <td>{(base.safe_random.mate_rate * 100).toFixed(1)}% → <Check report={base.safe_random.mate_rate} live={live?.safe_random.mate_rate} pct /></td>
                <td>{base.safe_random.mean_return} → <Check report={base.safe_random.mean_return} live={live?.safe_random.mean_return} /></td>
                <td>{live ? live.safe_random.mean_moves_to_mate.toFixed(2) : "—"}</td>
              </tr>
              <tr>
                <td><strong>Optimal π*</strong></td>
                <td>argmax q*, backward induction over h = 1…40</td>
                <td>{(base.optimal.mate_rate * 100).toFixed(1)}% → <Check report={base.optimal.mate_rate} live={live?.optimal.mate_rate} pct /></td>
                <td>{base.optimal.mean_return.toFixed(4)} → <Check report={base.optimal.mean_return} live={live?.optimal.mean_return} digits={4} /></td>
                <td>{dp_exact.mean_moves_to_mate} → <Check report={dp_exact.mean_moves_to_mate} live={live?.optimal.mean_moves_to_mate} digits={2} /></td>
              </tr>
            </tbody>
          </table>
        </div>
        {!live && (
          <button className="secondary" style={{ marginTop: 10 }} onClick={verify} disabled={baselines?.status === "running" || dpStatus?.status !== "ready"}>
            {baselines?.status === "running" ? "Evaluating 3 policies over 144,508 boards (~1 min)…" : dpStatus?.status !== "ready" ? "Solve the DP first (Explore tab)" : "Re-evaluate exactly now"}
          </button>
        )}
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
          Exact policy evaluation: the same backward recursion as the DP solver, but averaging over the policy's moves instead of
          taking the max — no sampling noise. Averages are over a uniform start on all 144,508 boards with h = 40.
        </div>
      </div>

      <div className="panel-grid">
        <div className="card">
          <div className="card-title">Real learning curves (measured in this app, exact greedy evaluation)</div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={curveData} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
              <CartesianGrid stroke="rgba(22,42,75,0.08)" />
              <XAxis dataKey="episodes" scale="log" type="number" domain={[1000, 500000]} ticks={[1000, 10000, 100000, 500000]}
                tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} tick={{ fontSize: 11 }} />
              <YAxis domain={[-1, 1]} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => v.toFixed(3)} labelFormatter={(v) => `${v.toLocaleString()} episodes`} />
              <Legend />
              <ReferenceLine y={dp_exact.v_star_mean} stroke={COLORS.gold} strokeDasharray="5 4" />
              <ReferenceLine y={mc.mean_return} stroke={COLORS.sage} strokeDasharray="2 3" />
              {CURVE_SERIES.map((s) => (
                <Line key={s.key} dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} connectNulls dot={{ r: 3 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            Dashed gold: v* = 0.927. Dotted green: the report's 100M-episode result (0.902). Seed 1, one run per setting.
            With the report's α = 0.01 and optimistic Q0 = +1 the greedy policy stays near random for the first ~10⁴ episodes.
          </div>
        </div>

        <div className="card2">
          <div className="card-title">Optimal (DP) vs. Trained (Monte Carlo)</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <tbody>
              {[
                ["Needs a model of P and R?", "Yes — enumerates every reply", "No — only plays games"],
                ["State used", "(wK, wQ, bK, h) — 144,508 × 40", "(wK, wQ, bK) up to symmetry — 18,081"],
                ["How values are obtained", "40 exact Bellman sweeps", "Averaging sampled returns, α = 0.01"],
                ["Compute", "~2–3 min, once", "100M episodes × 3 seeds (hours)"],
                ["Result", `v* = ${dp_exact.v_star_mean}, 100% mate, ${dp_exact.mean_moves_to_mate} moves`, `${mc.mean_return} ± ${mc.mean_return_std}, >99.99% mate, ${mc.mean_moves_to_mate} moves`],
                ["Role in the project", "Ground truth / benchmark", "The learning agent being tested"],
              ].map(([k, a, b]) => (
                <tr key={k} style={{ borderBottom: "1px solid rgba(22,42,75,0.08)" }}>
                  <td style={{ color: "var(--muted)", padding: "6px 4px" }}>{k}</td>
                  <td style={{ padding: "6px 4px" }}>{a}</td>
                  <td style={{ padding: "6px 4px" }}>{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
          {dpStatus && (
            <div className="stat-row">
              <span className="label">This server's DP</span>
              <span className="value">
                <span className={`badge ${dpStatus.status === "ready" ? "success" : "pending"}`}>{dpStatus.status}</span>
                {dpStatus.status === "ready" && ` · v*=${dpStatus.v_star_mean.toFixed(6)}`}
              </span>
            </div>
          )}
        </div>

        <div className="card2">
          <div className="card-title">Monte Carlo (report: 100M episodes × 3 seeds)</div>
          <div className="stat-row"><span className="label">Mean return</span><span className="value">{mc.mean_return.toFixed(4)} ± {mc.mean_return_std}</span></div>
          <div className="stat-row"><span className="label">Mean moves to mate</span><span className="value">{mc.mean_moves_to_mate} ± {mc.mean_moves_to_mate_std}</span></div>
          <div className="stat-row"><span className="label">Mate rate</span><span className="value">&gt; 99.99%</span></div>
          <div className="stat-row"><span className="label">% of optimal return</span><span className="value">{mc.pct_of_optimal_return}%</span></div>
          <div className="stat-row"><span className="label">α / ε / Q0</span><span className="value">{mc.algorithm.alpha} / {mc.algorithm.epsilon} / {mc.algorithm.q0}</span></div>
        </div>
      </div>

      <div className="key-rule">
        The DP and baseline numbers above are recomputed exactly by this server. The 100M-episode Monte Carlo result is the
        report's offline measurement — too long to rerun live; the learning curves show what this app reproduces at up to 500k episodes.
      </div>
    </div>
  );
}

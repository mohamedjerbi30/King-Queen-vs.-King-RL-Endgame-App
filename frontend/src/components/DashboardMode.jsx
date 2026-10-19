import { useEffect, useRef, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  LineChart, Line, Legend, ReferenceLine,
} from "recharts";
import { api } from "../api.js";
import { Badge, Button, Callout, Card, ErrorText, StatRow } from "../ui/index.jsx";

const COLORS = { navy: "#162A4B", gold: "#CC8A2C", rust: "#B1503E", sage: "#3C6B5C" };
const BAR_COLORS = [COLORS.rust, COLORS.gold, COLORS.sage, COLORS.navy];

const CURVE_SERIES = [
  { key: "report_settings", name: "α=0.01, Q0=+1 (report)", color: COLORS.navy },
  { key: "alpha_0_1_optimistic", name: "α=0.1, Q0=+1", color: COLORS.gold },
  { key: "fast_demo", name: "α=0.1, Q0=0", color: COLORS.sage },
];

function Check({ report, live, digits = 3, pct = false }) {
  if (live === undefined || live === null) return <Badge tone="neutral">not checked</Badge>;
  const fmt = (v) => (pct ? `${(v * 100).toFixed(1)}%` : v.toFixed(digits));
  const ok = fmt(report) === fmt(live); // agrees to the precision the report quotes
  return <Badge tone={ok ? "success" : "fail"}>{fmt(live)} {ok ? "✓" : "≠"}</Badge>;
}

function PolicyBars({ data, domain, unit, format }) {
  return (
    <ResponsiveContainer width="100%" height={230}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
        <CartesianGrid stroke="rgba(22,42,75,0.08)" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
        <YAxis tick={{ fontSize: 11 }} domain={domain} unit={unit} />
        <Tooltip formatter={format} />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {data.map((_, i) => <Cell key={i} fill={BAR_COLORS[i]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
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

  if (error) return <Card><ErrorText>{error}</ErrorText></Card>;
  if (!results) return <Card><div className="empty">Loading…</div></Card>;

  const { mdp, dp_exact, baselines: base, monte_carlo_final: mc, app_learning_curve: curves } = results;
  const live = baselines?.status === "ready" ? baselines.result : null;

  const names = ["Random", "Safe random", "MC (100M)", "Optimal"];
  const mateRateData = [base.uniform_random.mate_rate, base.safe_random.mate_rate, mc.mate_rate, base.optimal.mate_rate]
    .map((v, i) => ({ name: names[i], value: v * 100 }));
  const returnData = [base.uniform_random.mean_return, base.safe_random.mean_return, mc.mean_return, base.optimal.mean_return]
    .map((v, i) => ({ name: names[i], value: v }));

  const byEp = {};
  for (const s of CURVE_SERIES) {
    for (const p of curves[s.key].points) {
      byEp[p.episodes] = { ...(byEp[p.episodes] || { episodes: p.episodes }), [s.key]: p.mean_return };
    }
  }
  const curveData = Object.values(byEp).sort((a, b) => a.episodes - b.episodes);

  const checkRows = [
    { name: "Random", def: "any legal move, uniformly", r: base.uniform_random, l: live?.uniform_random },
    { name: "Safe random", def: "mate-in-one if available, otherwise a random move that neither stalemates nor hangs the queen", r: base.safe_random, l: live?.safe_random },
    { name: "Optimal π*", def: "best move from the exact DP solution", r: base.optimal, l: live?.optimal, moves: dp_exact.mean_moves_to_mate },
  ];

  return (
    <div className="dash">
      <div className="grid-2">
        <Card title="Games won (mate rate)" tour="dash-mate">
          <PolicyBars data={mateRateData} domain={[0, 100]} unit="%" format={(v) => `${v.toFixed(1)}%`} />
        </Card>
        <Card title="Average result (mean return)" tour="dash-return">
          <PolicyBars data={returnData} domain={[-1, 1]} format={(v) => v.toFixed(3)} />
        </Card>
      </div>

      <Card title="Are the report's numbers right?" tone="soft" tour="dash-check"
        actions={!live && (
          <Button variant="secondary" size="sm" onClick={verify}
            disabled={baselines?.status === "running" || dpStatus?.status !== "ready"} tour="dash-verify">
            {baselines?.status === "running" ? "Checking (~1 min)…" : dpStatus?.status !== "ready" ? "Needs the DP solution" : "Re-check now"}
          </Button>
        )}>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr><th>Policy</th><th>How it plays</th><th>Mate rate (report → checked)</th><th>Mean return (report → checked)</th><th>Moves to mate</th></tr>
            </thead>
            <tbody>
              {checkRows.map((row) => (
                <tr key={row.name}>
                  <td><strong>{row.name}</strong></td>
                  <td>{row.def}</td>
                  <td>{(row.r.mate_rate * 100).toFixed(1)}% → <Check report={row.r.mate_rate} live={row.l?.mate_rate} pct /></td>
                  <td>{row.r.mean_return.toFixed(row.moves ? 4 : 3)} → <Check report={row.r.mean_return} live={row.l?.mean_return} digits={row.moves ? 4 : 3} /></td>
                  <td>{row.moves ? <>{row.moves.toFixed(2)} → <Check report={row.moves} live={row.l?.mean_moves_to_mate} digits={2} /></> : row.l ? row.l.mean_moves_to_mate.toFixed(2) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="field-hint">
          "Checked" = recomputed exactly by this server on all 144,508 starting positions (no random sampling): the DP
          recursion, averaging over the policy's moves instead of taking the best one.
        </div>
      </Card>

      <div className="grid-2">
        <Card title="How fast Monte Carlo learns (measured in this app)" tour="dash-curves">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={curveData} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
              <CartesianGrid stroke="rgba(22,42,75,0.08)" />
              <XAxis dataKey="episodes" scale="log" type="number" domain={[1000, 500000]} ticks={[1000, 10000, 100000, 500000]}
                tickFormatter={(v) => `${v / 1000}k`} tick={{ fontSize: 11 }} />
              <YAxis domain={[-1, 1]} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => v.toFixed(3)} labelFormatter={(v) => `${v.toLocaleString()} episodes`} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine y={dp_exact.v_star_mean} stroke={COLORS.gold} strokeDasharray="5 4" />
              <ReferenceLine y={mc.mean_return} stroke={COLORS.sage} strokeDasharray="2 3" />
              {CURVE_SERIES.map((s) => (
                <Line key={s.key} dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} connectNulls dot={{ r: 3 }} isAnimationActive={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
          <div className="field-hint">
            Each point is an exact test of the learned policy. Dashed gold: best possible (0.927). Dotted green: the report's
            result after 100M episodes (0.902). With the report's settings the agent stays near random for the first ~10,000 games.
          </div>
        </Card>

        <Card title="Optimal (DP) vs Trained (MC)" tone="soft" tour="dash-compare">
          <table className="table compact">
            <thead><tr><th /><th>Optimal (DP)</th><th>Trained (MC)</th></tr></thead>
            <tbody>
              {[
                ["Knows the rules / model?", "Yes — enumerates every reply", "No — only plays games"],
                ["Position includes moves left?", "Yes (144,508 × 40)", "No (18,081 symmetry classes)"],
                ["How values are found", "40 exact Bellman sweeps", "Averaging returns, α = 0.01"],
                ["Compute", "~3 min, once", "100M games × 3 seeds"],
                ["Result", `${dp_exact.v_star_mean}, 100% mate, ${dp_exact.mean_moves_to_mate} moves`, `${mc.mean_return} ± ${mc.mean_return_std}, >99.99%, ${mc.mean_moves_to_mate} moves`],
                ["Role", "Answer key", "The learner being graded"],
              ].map(([k, a, b]) => (
                <tr key={k}><td className="muted">{k}</td><td>{a}</td><td>{b}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <div className="grid-2">
        <Card title="The MDP" tone="soft" tour="dash-mdp">
          <StatRow label="States" value={mdp.n_states.toLocaleString()} info="Legal (white king, queen, black king) placements with White to move." />
          <StatRow label="States after symmetry" value={mdp.n_states_symmetry_reduced.toLocaleString()} info="Rotations/reflections of the board are merged — used by the Monte Carlo table." />
          <StatRow label="Move budget" value={mdp.budget} />
          <StatRow label="Discount γ" value={mdp.gamma} info="Future rewards are multiplied by 0.99 per move, so faster mates are worth more." />
          <StatRow label="Reward (mate / fail / step)" value={`+${mdp.reward.checkmate} / ${mdp.reward.failure} / ${mdp.reward.step}`} />
          {dpStatus && (
            <StatRow label="This server's DP" value={<><Badge tone={dpStatus.status === "ready" ? "success" : "neutral"}>{dpStatus.status}</Badge>{dpStatus.status === "ready" && ` v* = ${dpStatus.v_star_mean.toFixed(6)}`}</>} />
          )}
        </Card>
        <Card title="Monte Carlo — report result (100M episodes × 3 seeds)" tone="soft" tour="dash-mc">
          <StatRow label="Mean return" value={`${mc.mean_return.toFixed(4)} ± ${mc.mean_return_std}`} />
          <StatRow label="Moves to mate" value={`${mc.mean_moves_to_mate} ± ${mc.mean_moves_to_mate_std}`} />
          <StatRow label="Mate rate" value="> 99.99%" />
          <StatRow label="Share of the best possible" value={`${mc.pct_of_optimal_return}%`} />
          <StatRow label="α / ε / Q0" value={`${mc.algorithm.alpha} / ${mc.algorithm.epsilon} / ${mc.algorithm.q0}`} />
        </Card>
      </div>

      <Callout tone="info">
        DP and baseline numbers are recomputed by this server. The 100M-episode Monte Carlo result is the report's offline
        measurement — too long to rerun live; the curves show what this app reproduces up to 500k episodes.
      </Callout>
    </div>
  );
}

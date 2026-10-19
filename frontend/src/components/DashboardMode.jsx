import { useEffect, useRef, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from "recharts";
import { api } from "../api.js";
import { Badge, Button, Callout, Card, ErrorText, StatRow } from "../ui/index.jsx";
import SessionResults from "./SessionResults.jsx";
import { useServerInfo } from "../lib/server.js";

const COLORS = { navy: "#162A4B", gold: "#CC8A2C", rust: "#B1503E", sage: "#3C6B5C" };
const BAR_COLORS = [COLORS.rust, COLORS.gold, "#8AA39A", COLORS.sage, COLORS.navy];

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

export default function DashboardMode({ active, onNavigate }) {
  const server = useServerInfo();
  const [results, setResults] = useState(null);
  const [dpStatus, setDpStatus] = useState(null);
  const [baselines, setBaselines] = useState(null);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => {
    api.results().then(setResults).catch((e) => setError(e.message));
    return () => clearInterval(pollRef.current);
  }, []);

  // Ask the server again every time the page is opened (its state can change).
  useEffect(() => {
    if (!active) return;
    api.dpStatus().then(setDpStatus).catch(() => setDpStatus(null));
    api.baselines().then(setBaselines).catch(() => {});
  }, [active, server?.reachable]);

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

  const { mdp, dp_exact, baselines: base, final_comparison: cmp } = results;
  const live = baselines?.status === "ready" ? baselines.result : null;
  const mcConst = cmp.methods.find((m) => m.name === "MC (constant)");
  const qLearning = cmp.methods.find((m) => m.name === cmp.selected);

  const bars = [
    ["Random", base.uniform_random], ["Safe random", base.safe_random],
    ["MC (const.)", mcConst], ["Q-learning", qLearning], ["Optimal", base.optimal],
  ];
  const mateRateData = bars.map(([name, r]) => ({ name, value: r.mate_rate * 100 }));
  const returnData = bars.map(([name, r]) => ({ name, value: r.mean_return }));

  const checkRows = [
    { name: "Random", def: "any legal move, uniformly", r: base.uniform_random, l: live?.uniform_random },
    { name: "Safe random", def: "mate-in-one if available, otherwise a random move that neither stalemates nor hangs the queen", r: base.safe_random, l: live?.safe_random },
    { name: "Optimal π*", def: "best move from the exact DP solution", r: base.optimal, l: live?.optimal, moves: dp_exact.mean_moves_to_mate },
  ];

  const dpMissing = dpStatus && dpStatus.status !== "ready";

  return (
    <div className="dash">
      <SessionResults onNavigate={onNavigate} />

      <div className="reference-head" data-tour="dash-reference">
        <div>
          <h2>Reference — the project report</h2>
          <p>
            These are <strong>not</strong> results from your session: they are the final report's numbers — the exact DP
            benchmarks and the controlled MC/TD comparison (20 million decisions × 3 seeds per method), shown for comparison.
          </p>
        </div>
        <Badge tone="neutral">reference</Badge>
      </div>

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
        {dpMissing && (
          <Callout tone="warn">
            This server has no exact DP solution loaded (status: {dpStatus.status}), so it cannot re-check these numbers.
            Run the backend locally (<code>python run.py</code>) — a hosted serverless version cannot build or store it.
          </Callout>
        )}
        <div className="field-hint">
          "Checked" = recomputed exactly by this server on all 144,508 starting positions (no random sampling): the DP
          recursion, averaging over the policy's moves instead of taking the best one.
        </div>
      </Card>

      <div className="grid-2">
        <Card title="Final MC / TD comparison (report)" tour="dash-comparison">
          <div className="table-scroll">
            <table className="table compact">
              <thead><tr><th>Method</th><th>Return</th><th>Mate</th><th>Moves</th><th>Certified</th><th>Keys visited</th></tr></thead>
              <tbody>
                {cmp.methods.map((m) => (
                  <tr key={m.name} className={m.name === cmp.selected ? "row-selected" : ""}>
                    <td><strong>{m.name}</strong>{m.name === cmp.selected && <Badge tone="success">selected</Badge>}</td>
                    <td>{m.mean_return.toFixed(4)} ± {m.sd.toFixed(4)}</td>
                    <td>{(100 * m.mate_rate).toFixed(2)}%</td>
                    <td>{m.moves.toFixed(2)}</td>
                    <td>{(100 * m.certified).toFixed(2)}%</td>
                    <td>{(100 * m.coverage).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="field-hint">
            20 million White decisions per run, seeds 11/23/37, exact evaluation on all 144,508 starts. "Certified" = share of
            starts where the policy forces mate against every Black reply. Live Training can rerun these methods at any budget.
          </div>
        </Card>

        <Card title="Optimal (DP) vs learned (MC / TD)" tone="soft" tour="dash-compare">
          <table className="table compact">
            <thead><tr><th /><th>Optimal (DP)</th><th>Learned (MC / TD)</th></tr></thead>
            <tbody>
              {[
                ["Knows the rules / model?", "Yes — enumerates every reply", "No — only plays games"],
                ["State", "(wK, wQ, bK, h) — 144,508 × 40", "same, symmetry-shared — 499,496 × 40"],
                ["How values are found", "40 exact Bellman sweeps", "sampled returns (MC) or bootstrapped targets (TD)"],
                ["Compute", "~3 min, once", "20M decisions × 3 seeds per method"],
                ["Result", `${dp_exact.v_star_mean}, 100% mate, ${dp_exact.mean_moves_to_mate} moves`, `Q-learning ${qLearning.mean_return} ± ${qLearning.sd}, ${(100 * qLearning.mate_rate).toFixed(2)}%, ${qLearning.moves} moves`],
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
        <Card title="Training protocol (report)" tone="soft" tour="dash-protocol">
          <StatRow label="Budget per run" value={`${(cmp.protocol.decisions_per_run / 1e6).toFixed(0)} M White decisions`} />
          <StatRow label="Seeds" value={cmp.protocol.seeds.join(", ")} />
          <StatRow label="Initial value Q0" value={cmp.protocol.q0} />
          <StatRow label="Step size α" value={cmp.protocol.alpha} />
          <StatRow label="Exploration ε" value="max(0.02, (1 + D/10⁴)^−½)" info={cmp.protocol.epsilon} />
          <StatRow label="Training starts" value="uniform board, uniform h" info={cmp.protocol.training_starts} />
        </Card>
      </div>

      <Callout tone="info">
        DP and baseline numbers are recomputed by this server. The MC/TD comparison is the report's offline measurement; Live
        Training runs the same five algorithms, with the same representation and settings, in your browser.
      </Callout>
    </div>
  );
}

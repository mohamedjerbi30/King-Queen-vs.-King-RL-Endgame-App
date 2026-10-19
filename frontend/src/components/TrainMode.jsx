import { useEffect, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from "recharts";
import { usePersistentState } from "../lib/storage.js";
import { useSelectedJob } from "./JobPicker.jsx";
import { recordRun } from "../lib/history.js";
import { parseAgentId } from "../lib/agents.js";
import { METHODS, epsilonAt } from "../lib/engine.js";
import { startBrowserTraining, stopBrowserTraining, testBrowserAgent, useBrowserJob } from "../lib/browserAgents.js";
import { Badge, Button, Callout, Card, ErrorText, Field, NumberInput, ProgressBar, Segmented, Select, StatRow } from "../ui/index.jsx";

const V_STAR = 0.927126;

// The report's final comparison (20 M decisions, mean of seeds 11/23/37), for side-by-side reading.
const REPORT_20M = {
  mc_mean: { ret: 0.3842, mate: 87.66, moves: 24.92 },
  mc_const: { ret: 0.4016, mate: 89.60, moves: 25.85 },
  sarsa: { ret: 0.5354, mate: 92.23, moves: 19.64 },
  expected_sarsa: { ret: 0.5544, mate: 92.63, moves: 18.82 },
  qlearning: { ret: 0.5567, mate: 92.88, moves: 18.95 },
};

const BUDGETS = {
  demo: { label: "Quick demo · 2M", decisions: 2_000_000 },
  report: { label: "Report budget · 20M", decisions: 20_000_000 },
};

const fmtM = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(n % 1e6 ? 1 : 0)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${n}`);

export default function TrainMode() {
  const [params, setParams] = usePersistentState("train.config", { method: "qlearning", decisions: 2_000_000, alpha: 0.1, q0: 0 });
  const [jobId, setJobId] = useSelectedJob();
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState(null);
  const maxDecisions = 20_000_000;

  // Training always runs in this browser (Web Worker); agents are saved in IndexedDB.
  const sel = parseAgentId(jobId);
  const job = useBrowserJob(sel?.kind === "browser" ? sel.id : null);
  const transport = job?.status === "running" ? "live" : "idle";
  const jobMethod = job?.params?.method;

  const set = (k) => (v) => setParams({ ...params, [k]: v });

  function start() {
    setError(null);
    const p = { ...params, decisions: Math.min(Math.max(10_000, Number(params.decisions) || 10_000), maxDecisions) };
    try {
      setJobId(`b:${startBrowserTraining(p)}`);
    } catch (e) {
      setError(e.message);
    }
  }

  function stop() {
    if (job) stopBrowserTraining(sel.id);
  }

  async function evaluate() {
    if (!job) return;
    setError(null);
    try {
      setTesting(true);
      await testBrowserAgent(sel.id);
    } catch (e) {
      setError(e.message);
    } finally {
      setTesting(false);
    }
  }

  // Keep every test result in the browser for the Results page.
  const lastEvalKey = job?.evaluations?.length ? `${job.job_id}:${job.evaluations.length}` : null;
  useEffect(() => {
    if (lastEvalKey) recordRun({ ...job, params: { ...(job.params || {}), method: jobMethod } }, job.evaluations[job.evaluations.length - 1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEvalKey]);

  const running = job?.status === "running";
  const curve = job?.curve ?? [];
  const evals = job?.evaluations ?? [];
  const lastEval = evals.length ? evals[evals.length - 1] : null;
  const merged = [
    ...curve.map((c) => ({ x: c.episode, behaviour: c.mean_return })),
    ...evals.map((e) => ({ x: e.episodes, greedy: e.mean_return })),
  ].sort((a, b) => a.x - b.x);
  const ref = REPORT_20M[jobMethod];

  let eta = null;
  if (running && job.decisions_done > 0 && job.started_at) {
    const rate = job.decisions_done / (Date.now() / 1000 - job.started_at);
    eta = Math.max(0, Math.round((job.decisions_target - job.decisions_done) / rate));
  }

  return (
    <div className="page-grid">
      <Card title="Learning curve" tour="train-chart">
        {merged.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={merged} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
              <CartesianGrid stroke="rgba(22,42,75,0.08)" />
              <XAxis dataKey="x" type="number" domain={[0, "dataMax"]} tick={{ fontSize: 11 }} tickFormatter={fmtM} />
              <YAxis tick={{ fontSize: 11 }} domain={[-1, 1]} />
              <Tooltip formatter={(v) => v.toFixed(3)} labelFormatter={(v) => `${v.toLocaleString()} decisions`} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine y={V_STAR} stroke="#CC8A2C" strokeDasharray="5 4"
                label={{ value: "best possible v* = 0.927", fontSize: 11, fill: "#CC8A2C", position: "insideTopLeft" }} />
              {ref && <ReferenceLine y={ref.ret} stroke="#3C6B5C" strokeDasharray="2 3"
                label={{ value: `report @20M: ${ref.ret}`, fontSize: 11, fill: "#3C6B5C", position: "insideBottomRight" }} />}
              <Line type="monotone" dataKey="behaviour" name="Training episodes (exploring, random h)" stroke="#162A4B" dot={false} strokeWidth={2} connectNulls isAnimationActive={false} />
              <Line type="monotone" dataKey="greedy" name="Test of the greedy policy (5,000 games, h = 40)" stroke="#3C6B5C" strokeWidth={0} dot={{ r: 5, fill: "#3C6B5C" }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="empty">Choose a method on the right and press <strong>Start training</strong> — the curve builds live here.</div>
        )}
        <Callout tone="info" tour="train-reading">
          <strong>Two measurements.</strong> The <strong>dark line</strong> averages the last 500 training episodes — noisy, since the
          agent explores and episodes start with a random remaining budget h. The <strong>green dots</strong> test the greedy
          policy with no exploration from h = 40 on 5,000 fixed positions (an estimate, about ±0.01). The dotted line is the
          report's result for this method at 20 million decisions.
        </Callout>
      </Card>

      <div className="side">
        <Card title="Settings" tone="soft" tour="train-settings">
          <Field label="Method" tour="train-method"
            info="The five learners compared in the report. MC waits for the end of the game; SARSA, Expected SARSA and Q-learning update after every move from an estimate of what follows (bootstrapping).">
            <Select value={params.method} onChange={set("method")}
              options={Object.entries(METHODS).map(([value, label]) => ({ value, label }))} />
          </Field>
          <Field label="Budget" tour="train-presets"
            info="Number of White decisions (moves) used for training, as in the report — so methods with longer games don't get more experience.">
            <Segmented value={Object.keys(BUDGETS).find((k) => BUDGETS[k].decisions === params.decisions) ?? ""}
              onChange={(k) => setParams({ ...params, decisions: BUDGETS[k].decisions })}
              options={Object.entries(BUDGETS).map(([value, b]) => ({ value, label: b.label, disabled: b.decisions > maxDecisions }))} />
          </Field>
          <Field label="Decisions" info={`Any value from 10,000 to ${maxDecisions.toLocaleString()}.`}>
            <NumberInput value={params.decisions} min={10000} max={maxDecisions} step={100000} onChange={set("decisions")} />
          </Field>
          <Field label="α (step size)" info="Q ← Q + α (target − Q). MC (mean) uses 1/N instead (the running average).">
            <NumberInput value={params.alpha} step={0.01} min={0.001} max={1} onChange={set("alpha")} disabled={params.method === "mc_mean"} />
          </Field>
          <Field label="Q0 (initial value)" info="Value of moves never tried. The report uses 0 (no optimism, no planning-derived initialisation).">
            <NumberInput value={params.q0} step={0.1} min={-1} max={1} onChange={set("q0")} />
          </Field>
          <div className="field-hint">
            Exploration follows the report: ε = max(0.02, (1 + D/10,000)<sup>−½</sup>) after D decisions, fixed within an episode.
            Each episode starts from a random legal board and a random remaining budget h ∈ 1…40; the state always includes h.
          </div>
          <div className="button-row" data-tour="train-buttons">
            <Button onClick={start} disabled={running}>▶ Start training</Button>
            <Button variant="secondary" onClick={stop} disabled={!running}>■ Stop</Button>
          </div>
          <div className="field-hint">
            Training runs in this browser tab (about 400,000 decisions/s: 20M in about a minute). Keep the tab open; switching pages is fine.
          </div>
          <ErrorText>{error}</ErrorText>
        </Card>

        {job && (
          <Card title="This run" tone="soft" tour="train-status">
            <div className="board-status">
              <Badge tone={running ? "pending" : job.status === "done" ? "success" : "neutral"}>{job.status}</Badge>
              <span className="muted">{METHODS[jobMethod] || jobMethod}</span>
              <span className="live-label"><i className={`live-dot live-${transport}`} />
                {transport === "live" ? "live (in this tab)" : "up to date"}</span>
            </div>
            <ProgressBar value={job.decisions_done} max={job.decisions_target} label="training progress" />
            <StatRow label="Decisions" value={`${fmtM(job.decisions_done)} / ${fmtM(job.decisions_target)}${eta !== null ? ` · ~${eta}s left` : ""}`} />
            <StatRow label="Episodes" value={(job.episodes_done ?? 0).toLocaleString()} />
            <StatRow label="Current ε" value={(job.epsilon ?? epsilonAt(job.decisions_done)).toFixed(3)} info="Exploration rate after this many decisions (report schedule)." />
            <Button variant="secondary" block onClick={evaluate} disabled={testing || running} tour="train-evaluate">
              {testing ? "Testing…"
                : running ? "Tested automatically every 10% of the run" : "Test the learned policy again"}
            </Button>
            {lastEval && (
              <div data-tour="train-results">
                <div className="subhead">
                  {lastEval.sampled ? `Test on ${lastEval.n_games.toLocaleString()} games` : "Exact test"} after {fmtM(lastEval.episodes)} decisions
                </div>
                <StatRow label="Mean return" value={`${lastEval.mean_return.toFixed(4)}${lastEval.sampled ? ` ±${lastEval.mean_return_se.toFixed(3)}` : ""}${ref ? ` (report 20M: ${ref.ret})` : ""}`} />
                <StatRow label="Games won (mate)" value={`${(lastEval.mate_rate * 100).toFixed(2)}%${ref ? ` (report: ${ref.mate}%)` : ""}`} />
                <StatRow label="Moves to mate" value={`${lastEval.mean_moves_to_mate?.toFixed(2) ?? "—"}${ref ? ` (report: ${ref.moves})` : ""}`} />
                {lastEval.mean_return > 0 && (
                  <StatRow label="Share of the best possible" value={`${lastEval.pct_of_optimal.toFixed(1)}% of v* = 0.927`} />
                )}
                {lastEval.coverage !== undefined && (
                  <StatRow label="Q entries visited" value={`${(lastEval.coverage * 100).toFixed(1)}% of 19,979,840`} />
                )}
                {lastEval.agreement !== undefined && (
                  <StatRow label="Boards where it plays a best move" value={`${(lastEval.agreement * 100).toFixed(1)}%`} />
                )}
              </div>
            )}
            <div className="field-hint">This agent is selectable in Play (Trained) and Explore (Learned / Compare) once its first checkpoint is saved.</div>
          </Card>
        )}
      </div>
    </div>
  );
}

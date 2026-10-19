import { useEffect, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from "recharts";
import { api } from "../api.js";
import { usePersistentState } from "../lib/storage.js";
import { useSelectedJob } from "./JobPicker.jsx";
import { useJobStream } from "../lib/live.js";
import { recordRun } from "../lib/history.js";
import { Badge, Button, Callout, Card, ErrorText, Field, NumberInput, ProgressBar, Segmented, StatRow } from "../ui/index.jsx";

const V_STAR = 0.927126;

const PRESETS = {
  official: { label: "Report settings", alpha: 0.01, epsilon: 0.05, q0: 1.0, episodes: 200000,
    note: "α = 0.01, ε = 0.05, Q0 = +1 — exactly the presentation's algorithm. Slow at this scale: the optimistic Q0 makes the agent try every move several times before it can prefer good ones." },
  fast: { label: "Fast demo", alpha: 0.1, epsilon: 0.05, q0: 0.0, episodes: 50000,
    note: "α = 0.1, Q0 = 0 — learns visibly within ~30k episodes, but explores less, so it mates more slowly. Not the report's configuration." },
  custom: { label: "Custom", note: "Your own values — change any field below." },
};

export default function TrainMode() {
  const [preset, setPreset] = usePersistentState("train.preset", "official");
  const [params, setParams] = usePersistentState("train.params", { episodes: 200000, alpha: 0.01, epsilon: 0.05, q0: 1.0, budget: 40 });
  const [jobId, setJobId] = useSelectedJob();
  const [reconnect, setReconnect] = useState(0);
  const { job, transport, missing } = useJobStream(jobId, reconnect);
  const [error, setError] = useState(null);

  const setParam = (k) => (v) => {
    setParams({ ...params, [k]: v });
    setPreset("custom");
  };

  function applyPreset(key) {
    setPreset(key);
    if (key === "custom") return;
    const p = PRESETS[key];
    setParams({ ...params, alpha: p.alpha, epsilon: p.epsilon, q0: p.q0, episodes: p.episodes });
  }

  async function start() {
    setError(null);
    try {
      const res = await api.trainStart(params);
      setJobId(res.job_id);
    } catch (e) {
      setError(e.message);
    }
  }

  async function stop() {
    if (job) await api.trainStop(job.job_id).catch((e) => setError(e.message));
  }

  async function evaluate() {
    if (!job) return;
    setError(null);
    try {
      await api.trainEvaluate(job.job_id);
      setReconnect((n) => n + 1); // reopen the live stream to receive the result
    } catch (e) {
      setError(e.message);
    }
  }

  // Keep every exact test result in the browser for the Results page.
  const lastEvalKey = job?.evaluations?.length ? `${job.job_id}:${job.evaluations.length}` : null;
  useEffect(() => {
    if (lastEvalKey) recordRun(job, job.evaluations[job.evaluations.length - 1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEvalKey]);

  const running = job?.status === "running";
  const curve = job?.curve ?? [];
  const evals = job?.evaluations ?? [];
  const lastEval = evals.length ? evals[evals.length - 1] : null;
  const merged = [
    ...curve.map((c) => ({ episode: c.episode, behaviour: c.mean_return })),
    ...evals.map((e) => ({ episode: e.episodes, greedy: e.mean_return })),
  ].sort((a, b) => a.episode - b.episode);

  // Rough time left from the average speed so far.
  let eta = null;
  if (running && job.episodes_done > 0 && job.started_at) {
    const rate = job.episodes_done / (Date.now() / 1000 - job.started_at);
    eta = Math.max(0, Math.round((job.episodes_target - job.episodes_done) / rate));
  }

  return (
    <div className="page-grid">
      <Card title="Learning curve" tour="train-chart">
        {merged.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={merged} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
              <CartesianGrid stroke="rgba(22,42,75,0.08)" />
              <XAxis dataKey="episode" type="number" domain={[0, "dataMax"]} tick={{ fontSize: 11 }}
                tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
              <YAxis tick={{ fontSize: 11 }} domain={[-1, 1]} />
              <Tooltip formatter={(v) => v.toFixed(3)} labelFormatter={(v) => `${v.toLocaleString()} episodes`} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine y={V_STAR} stroke="#CC8A2C" strokeDasharray="5 4"
                label={{ value: "best possible v* = 0.927", fontSize: 11, fill: "#CC8A2C", position: "insideTopLeft" }} />
              <Line type="monotone" dataKey="behaviour" name="Training games (with exploration)" stroke="#162A4B" dot={false} strokeWidth={2} connectNulls isAnimationActive={false} />
              <Line type="monotone" dataKey="greedy" name="Exact test of the learned policy" stroke="#3C6B5C" strokeWidth={0} dot={{ r: 5, fill: "#3C6B5C" }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="empty">Choose settings on the right and press <strong>Start training</strong> — the curve builds live here.</div>
        )}
        <Callout tone="info" tour="train-reading">
          <strong>Two measurements.</strong> The <strong>dark line</strong> is the average result of the last 500 training games —
          noisy, because the agent still explores 5% of the time. The <strong>green dots</strong> test what it has learned so far,
          exactly, on all 144,508 starting positions with no exploration — directly comparable with the best possible 0.927.
        </Callout>
      </Card>

      <div className="side">
        <Card title="Settings" tone="soft" tour="train-settings">
          <Segmented value={preset} onChange={applyPreset} tour="train-presets"
            options={Object.entries(PRESETS).map(([k, p]) => ({ value: k, label: p.label }))} />
          <div className="field-hint">{PRESETS[preset].note}</div>
          <Field label="Episodes" info="Number of training games. Each game starts from a random position.">
            <NumberInput value={params.episodes} min={100} max={500000} step={1000} onChange={setParam("episodes")} />
          </Field>
          <Field label="α (step size)" info="How far each Q-value moves toward a newly observed return: Q ← Q + α(G − Q).">
            <NumberInput value={params.alpha} step={0.001} min={0.0001} max={1} onChange={setParam("alpha")} />
          </Field>
          <Field label="ε (exploration)" info="Probability of playing a random legal move instead of the best known one during training.">
            <NumberInput value={params.epsilon} step={0.01} min={0} max={1} onChange={setParam("epsilon")} />
          </Field>
          <Field label="Q0 (initial value)" info="Value given to moves never tried. +1 is optimistic: untried moves look perfect, so the agent tries them all.">
            <NumberInput value={params.q0} step={0.1} min={-1} max={1} onChange={setParam("q0")} />
          </Field>
          <Field label="Move budget" info="Maximum White moves per game (the project uses 40).">
            <NumberInput value={params.budget} min={1} max={40} onChange={setParam("budget")} />
          </Field>
          <div className="button-row" data-tour="train-buttons">
            <Button onClick={start} disabled={running}>▶ Start training</Button>
            <Button variant="secondary" onClick={stop} disabled={!running}>■ Stop</Button>
          </div>
          <ErrorText>{error}</ErrorText>
        </Card>

        {missing && (
          <Callout tone="warn">
            The selected run no longer exists on the server (it was probably restarted). Start a new training run.
          </Callout>
        )}
        {job && (
          <Card title="This run" tone="soft" tour="train-status">
            <div className="board-status">
              <Badge tone={running ? "pending" : job.status === "done" ? "success" : "neutral"}>{job.status}</Badge>
              <span className="muted">agent {job.job_id.slice(0, 6)}</span>
              <span className="live-label"><i className={`live-dot live-${transport}`} />
                {transport === "live" ? "live (WebSocket)" : transport === "polling" ? "updating every second" : "up to date"}</span>
            </div>
            <ProgressBar value={job.episodes_done} max={job.episodes_target} label="training progress" />
            <StatRow label="Episodes" value={`${job.episodes_done.toLocaleString()} / ${job.episodes_target.toLocaleString()}${eta !== null ? ` · ~${eta}s left` : ""}`} />
            <StatRow label="Q-table entries" value={job.qtable_size.toLocaleString()} info="Number of (position, move) pairs the agent has a value for." />
            <Button variant="secondary" block onClick={evaluate} disabled={job.eval_status === "running"} tour="train-evaluate">
              {job.eval_status === "running" ? "Testing on 144,508 positions…" : "Test the learned policy now"}
            </Button>
            {lastEval && (
              <div data-tour="train-results">
                <div className="subhead">Exact test after {lastEval.episodes.toLocaleString()} episodes</div>
                <StatRow label="Mean return" value={`${lastEval.mean_return.toFixed(4)} (best 0.9271)`} />
                <StatRow label="Share of the best possible" value={`${lastEval.pct_of_optimal.toFixed(1)}%`} />
                <StatRow label="Games won (mate)" value={`${(lastEval.mate_rate * 100).toFixed(2)}%`} />
                <StatRow label="Moves to mate" value={`${lastEval.mean_moves_to_mate?.toFixed(2) ?? "—"} (best 4.70)`} />
                <StatRow label="Positions where it plays a best move" value={`${(lastEval.agreement * 100).toFixed(1)}%`} />
                <StatRow label="(position, move) pairs tried" value={`${(lastEval.coverage * 100).toFixed(1)}%`} />
              </div>
            )}
            <div className="field-hint">This agent is now selectable in Play and Explore (Trained / Learned).</div>
          </Card>
        )}
      </div>
    </div>
  );
}

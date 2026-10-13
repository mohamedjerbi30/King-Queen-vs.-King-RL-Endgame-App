import { useEffect, useRef, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from "recharts";
import { api } from "../api.js";

const V_STAR = 0.927126;

const PRESETS = {
  official: { label: "Report settings", alpha: 0.01, epsilon: 0.05, q0: 1.0, episodes: 200000,
    note: "α = 0.01, ε = 0.05, Q0 = +1 — exactly the presentation's algorithm. Slow at this scale: the optimistic Q0 makes the agent try every move several times before it can prefer good ones." },
  fast: { label: "Fast demo", alpha: 0.1, epsilon: 0.05, q0: 0.0, episodes: 50000,
    note: "α = 0.1, Q0 = 0 — learns visibly within ~30k episodes, but explores less, so it plateaus with slower mates. Not the report's configuration." },
};

export default function TrainMode() {
  const [episodes, setEpisodes] = useState(PRESETS.official.episodes);
  const [alpha, setAlpha] = useState(0.01);
  const [epsilon, setEpsilon] = useState(0.05);
  const [q0, setQ0] = useState(1.0);
  const [budget, setBudget] = useState(40);
  const [preset, setPreset] = useState("official");
  const [job, setJob] = useState(null); // latest status summary
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => () => clearInterval(pollRef.current), []);

  function applyPreset(key) {
    const p = PRESETS[key];
    setPreset(key);
    setAlpha(p.alpha);
    setEpsilon(p.epsilon);
    setQ0(p.q0);
    setEpisodes(p.episodes);
  }

  function poll(jobId) {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const s = await api.trainStatus(jobId);
        setJob(s);
        if (s.status !== "running" && s.eval_status !== "running") clearInterval(pollRef.current);
      } catch (e) {
        setError(e.message);
        clearInterval(pollRef.current);
      }
    }, 800);
  }

  async function start() {
    setError(null);
    try {
      const res = await api.trainStart({ episodes, alpha, epsilon, q0, budget });
      setJob({ job_id: res.job_id, status: "running", episodes_done: 0, episodes_target: episodes, curve: [], evaluations: [] });
      poll(res.job_id);
    } catch (e) {
      setError(e.message);
    }
  }

  async function stop() {
    if (!job) return;
    try {
      await api.trainStop(job.job_id);
    } catch (e) {
      setError(e.message);
    }
  }

  async function evaluate() {
    if (!job) return;
    setError(null);
    try {
      setJob(await api.trainEvaluate(job.job_id));
      poll(job.job_id);
    } catch (e) {
      setError(e.message);
    }
  }

  const curve = job?.curve ?? [];
  const evals = job?.evaluations ?? [];
  const latest = curve.length ? curve[curve.length - 1] : null;
  const lastEval = evals.length ? evals[evals.length - 1] : null;

  // Merge behaviour points and exact greedy evaluations on one episode axis.
  const merged = [
    ...curve.map((c) => ({ episode: c.episode, behaviour: c.mean_return })),
    ...evals.map((e) => ({ episode: e.episodes, greedy: e.mean_return })),
  ].sort((a, b) => a.episode - b.episode);

  return (
    <div className="panel-grid">
      <div className="card">
        <div className="card-title">Learning curve (this run)</div>
        {merged.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={merged} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
              <CartesianGrid stroke="rgba(22,42,75,0.08)" />
              <XAxis dataKey="episode" type="number" domain={[0, "dataMax"]} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} domain={[-1, 1]} />
              <Tooltip formatter={(v) => v.toFixed(3)} />
              <Legend />
              <ReferenceLine y={V_STAR} stroke="#CC8A2C" strokeDasharray="5 4" label={{ value: "v* = 0.927", fontSize: 11, fill: "#CC8A2C", position: "insideTopLeft" }} />
              <Line type="monotone" dataKey="behaviour" name="Training return (ε-greedy, last 500 ep.)" stroke="#162A4B" dot={false} strokeWidth={2} connectNulls />
              <Line type="monotone" dataKey="greedy" name="Greedy policy, exact evaluation" stroke="#3C6B5C" strokeWidth={0} dot={{ r: 5, fill: "#3C6B5C" }} connectNulls={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ padding: 60, textAlign: "center", color: "var(--muted)" }}>
            Start a training run to see the learning curve build live.
          </div>
        )}

        <div className="key-rule">
          Two different measurements. The <strong>line</strong> is the average return of the last 500
          training episodes — it includes ε-exploration and random starting boards, so it is noisy and
          slightly pessimistic. The <strong>green dots</strong> are exact evaluations of the current greedy
          policy (no exploration) over all 144,508 starting boards, using the DP model — the same measure
          as v* = 0.927. Click "Evaluate exactly" at any time; it also runs automatically when training ends.
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="card2">
          <div className="card-title">Training parameters</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            {Object.entries(PRESETS).map(([k, p]) => (
              <button key={k} className={preset === k ? "primary" : "secondary"} style={{ flex: 1 }} onClick={() => applyPreset(k)}>
                {p.label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>{PRESETS[preset].note}</div>
          <div className="field-row"><span>Episodes</span><input type="number" value={episodes} min={100} max={500000} onChange={(e) => setEpisodes(+e.target.value)} /></div>
          <div className="field-row"><span>Alpha (step size)</span><input type="number" step="0.001" value={alpha} onChange={(e) => setAlpha(+e.target.value)} /></div>
          <div className="field-row"><span>Epsilon (exploration)</span><input type="number" step="0.01" value={epsilon} onChange={(e) => setEpsilon(+e.target.value)} /></div>
          <div className="field-row"><span>Q0 (initial Q)</span><input type="number" step="0.1" value={q0} onChange={(e) => setQ0(+e.target.value)} /></div>
          <div className="field-row"><span>Budget</span><input type="number" value={budget} onChange={(e) => setBudget(+e.target.value)} /></div>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button className="primary" style={{ flex: 1 }} onClick={start} disabled={job?.status === "running"}>
              Start training
            </button>
            <button className="secondary" style={{ flex: 1 }} onClick={stop} disabled={job?.status !== "running"}>
              Stop
            </button>
          </div>
          {error && <div style={{ color: "var(--rust)", fontSize: 12.5, marginTop: 8 }}>{error}</div>}
        </div>

        {job && (
          <div className="card2">
            <div className="card-title">Job status</div>
            <div className="stat-row"><span className="label">Job id</span><span className="value">{job.job_id}</span></div>
            <div className="stat-row"><span className="label">Status</span><span className="value">{job.status}</span></div>
            <div className="stat-row"><span className="label">Episodes</span><span className="value">{job.episodes_done?.toLocaleString()} / {job.episodes_target?.toLocaleString()}</span></div>
            <div className="stat-row"><span className="label">Q-table entries (state, move)</span><span className="value">{job.qtable_size?.toLocaleString()}</span></div>
            {latest && (
              <>
                <div className="stat-row"><span className="label">Training return (window)</span><span className="value">{latest.mean_return.toFixed(3)}</span></div>
                <div className="stat-row"><span className="label">Training mate rate (window)</span><span className="value">{(latest.mate_rate * 100).toFixed(1)}%</span></div>
              </>
            )}
            <button className="secondary" style={{ width: "100%", marginTop: 8 }} onClick={evaluate} disabled={job.eval_status === "running"}>
              {job.eval_status === "running" ? "Evaluating over 144,508 boards…" : "Evaluate greedy policy exactly"}
            </button>
            {lastEval && (
              <>
                <div className="card-title" style={{ marginTop: 12 }}>Exact evaluation @ {lastEval.episodes.toLocaleString()} episodes</div>
                <div className="stat-row"><span className="label">Mean return (v* = {lastEval.v_star.toFixed(4)})</span><span className="value">{lastEval.mean_return.toFixed(4)}</span></div>
                <div className="stat-row"><span className="label">% of optimal return</span><span className="value">{lastEval.pct_of_optimal.toFixed(1)}%</span></div>
                <div className="stat-row"><span className="label">Mate rate</span><span className="value">{(lastEval.mate_rate * 100).toFixed(2)}%</span></div>
                <div className="stat-row"><span className="label">Mean moves to mate (π*: 4.70)</span><span className="value">{lastEval.mean_moves_to_mate?.toFixed(2) ?? "—"}</span></div>
                <div className="stat-row"><span className="label">Boards where it plays an optimal move</span><span className="value">{(lastEval.agreement * 100).toFixed(1)}%</span></div>
                <div className="stat-row"><span className="label">(state, move) pairs ever tried</span><span className="value">{(lastEval.coverage * 100).toFixed(1)}%</span></div>
              </>
            )}
            <div className="key-rule" style={{ marginTop: 10 }}>
              This job now appears in the job list of Play and Explore (source: Monte Carlo).
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

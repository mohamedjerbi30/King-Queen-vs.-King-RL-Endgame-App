import { useEffect, useRef, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { api } from "../api.js";

export default function TrainMode() {
  const [episodes, setEpisodes] = useState(20000);
  const [alpha, setAlpha] = useState(0.01);
  const [epsilon, setEpsilon] = useState(0.05);
  const [q0, setQ0] = useState(1.0);
  const [budget, setBudget] = useState(40);
  const [job, setJob] = useState(null); // latest status summary
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => () => clearInterval(pollRef.current), []);

  async function start() {
    setError(null);
    try {
      const res = await api.trainStart({ episodes, alpha, epsilon, q0, budget });
      const jobId = res.job_id;
      setJob({ job_id: jobId, status: "running", episodes_done: 0, episodes_target: episodes, curve: [] });
      clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const s = await api.trainStatus(jobId);
          setJob(s);
          if (s.status !== "running") clearInterval(pollRef.current);
        } catch (e) {
          setError(e.message);
          clearInterval(pollRef.current);
        }
      }, 800);
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

  const curve = job?.curve ?? [];
  const latest = curve.length ? curve[curve.length - 1] : null;

  return (
    <div className="panel-grid">
      <div className="card">
        <div className="card-title">Learning curve (this run)</div>
        {curve.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={curve} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
              <CartesianGrid stroke="rgba(22,42,75,0.08)" />
              <XAxis dataKey="episode" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} domain={[-1, 1]} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} domain={[0, 1]} />
              <Tooltip />
              <Legend />
              <Line yAxisId="left" type="monotone" dataKey="mean_return" name="Mean return" stroke="#162A4B" dot={false} strokeWidth={2} />
              <Line yAxisId="right" type="monotone" dataKey="mate_rate" name="Mate rate" stroke="#CC8A2C" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ padding: 60, textAlign: "center", color: "var(--muted)" }}>
            Start a training run to see the learning curve build live.
          </div>
        )}

        <div className="key-rule">
          This is a bounded, live demo (up to 500,000 episodes) running first-visit Monte Carlo
          control with a constant step size — it will not reach the asymptotic numbers from the
          Results Dashboard (those come from 100M episodes × 3 seeds offline), but the same learning
          dynamics are visible within seconds.
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="card2">
          <div className="card-title">Training parameters</div>
          <div className="field-row"><span>Episodes</span><input type="number" value={episodes} min={100} max={500000} onChange={(e) => setEpisodes(+e.target.value)} /></div>
          <div className="field-row"><span>Alpha (step size)</span><input type="number" step="0.001" value={alpha} onChange={(e) => setAlpha(+e.target.value)} /></div>
          <div className="field-row"><span>Epsilon (exploration)</span><input type="number" step="0.01" value={epsilon} onChange={(e) => setEpsilon(+e.target.value)} /></div>
          <div className="field-row"><span>Q0 (optimistic init)</span><input type="number" step="0.1" value={q0} onChange={(e) => setQ0(+e.target.value)} /></div>
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
            <div className="stat-row"><span className="label">Episodes</span><span className="value">{job.episodes_done} / {job.episodes_target}</span></div>
            <div className="stat-row"><span className="label">Q-table size</span><span className="value">{job.qtable_size}</span></div>
            {latest && (
              <>
                <div className="stat-row"><span className="label">Mean return (window)</span><span className="value">{latest.mean_return.toFixed(3)}</span></div>
                <div className="stat-row"><span className="label">Mate rate (window)</span><span className="value">{(latest.mate_rate * 100).toFixed(1)}%</span></div>
              </>
            )}
            <div className="key-rule" style={{ marginTop: 10 }}>
              Use this job id in Explore or Play mode (source: Monte Carlo) to query or play against
              what it has learned so far.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

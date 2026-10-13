import { useEffect, useState } from "react";
import { api } from "../api.js";

// Dropdown of this server's Monte Carlo training jobs (most recent first),
// so Play/Explore never need a job id copied by hand from Live Training.
export default function JobPicker({ value, onChange }) {
  const [jobs, setJobs] = useState([]);

  async function refresh() {
    try {
      const res = await api.trainJobs();
      const sorted = [...res.jobs].sort((a, b) => b.started_at - a.started_at);
      setJobs(sorted);
      if (!value && sorted.length) onChange(sorted[0].job_id);
    } catch {
      setJobs([]);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="field-row">
      <span>Training job</span>
      <span style={{ display: "flex", gap: 6 }}>
        <select value={value} onChange={(e) => onChange(e.target.value)} style={{ maxWidth: 190 }}>
          {jobs.length === 0 && <option value="">none yet — use Live Training</option>}
          {jobs.map((j) => (
            <option key={j.job_id} value={j.job_id}>
              {j.job_id.slice(0, 6)} · {j.episodes_done.toLocaleString()} ep · {j.status}
            </option>
          ))}
        </select>
        <button className="secondary" onClick={refresh} title="Refresh job list">↻</button>
      </span>
    </div>
  );
}

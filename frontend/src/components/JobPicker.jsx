import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import { usePersistentState } from "../lib/storage.js";
import { Button, Field, Select } from "../ui/index.jsx";

/** The selected Monte Carlo job, shared by every page and kept in localStorage. */
export function useSelectedJob() {
  return usePersistentState("selectedJob", "");
}

/** Jobs this server knows about, newest first. Jobs live in server memory, so
 *  a stored job id becomes stale after a server restart — callers check it. */
export function useJobs() {
  const [jobs, setJobs] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const res = await api.trainJobs();
      setJobs([...res.jobs].sort((a, b) => b.started_at - a.started_at));
    } catch {
      setJobs([]);
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);
  return { jobs, loaded, refresh };
}

export default function JobPicker({ tour }) {
  const [jobId, setJobId] = useSelectedJob();
  const { jobs, loaded, refresh } = useJobs();

  // Keep the selection valid: drop ids the server no longer has, pick the newest otherwise.
  useEffect(() => {
    if (!loaded) return;
    if (jobs.length === 0) {
      if (jobId) setJobId("");
    } else if (!jobs.some((j) => j.job_id === jobId)) {
      setJobId(jobs[0].job_id);
    }
  }, [loaded, jobs, jobId, setJobId]);

  const options = jobs.length
    ? jobs.map((j) => ({
        value: j.job_id,
        label: `${j.job_id.slice(0, 6)} · ${j.episodes_done.toLocaleString()} episodes · ${j.status}`,
      }))
    : [{ value: "", label: "No trained agent yet" }];

  return (
    <Field
      label="Trained agent"
      tour={tour}
      info="Each Live Training run creates one Monte Carlo agent. Runs live in the server's memory: restarting the server removes them."
      hint={jobs.length === 0 ? "Go to Live Training and start a run first." : null}
    >
      <span className="inline-controls">
        <Select value={jobId} onChange={setJobId} options={options} disabled={!jobs.length} />
        <Button variant="secondary" size="sm" onClick={refresh} title="Refresh the list">↻</Button>
      </span>
    </Field>
  );
}

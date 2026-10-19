import { useEffect } from "react";
import { useLiveJobs } from "../lib/live.js";
import { usePersistentState } from "../lib/storage.js";
import { Field, Select } from "../ui/index.jsx";

/** The selected Monte Carlo job, shared by every page and kept in localStorage. */
export function useSelectedJob() {
  return usePersistentState("selectedJob", "");
}

/** Trained agents this server knows about, pushed live over a WebSocket.
 *  Jobs live in server memory, so a stored id becomes stale after a restart. */
export function useJobs() {
  return useLiveJobs();
}

export default function JobPicker({ tour }) {
  const [jobId, setJobId] = useSelectedJob();
  const { jobs, loaded, transport } = useJobs();

  // Keep the selection valid: drop ids the server no longer has, pick the newest otherwise.
  // Runs only when the server's list changes, so a job that was just started
  // (and selected) is not replaced before the list includes it.
  useEffect(() => {
    if (!loaded) return;
    setJobId((cur) => (jobs.length === 0 ? "" : jobs.some((j) => j.job_id === cur) ? cur : jobs[0].job_id));
  }, [loaded, jobs, setJobId]);

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
        <span className={`live-dot live-${transport}`} title={transport === "live" ? "Updated live (WebSocket)" : transport === "polling" ? "Updated every few seconds (no WebSocket)" : "Server unreachable"} />
      </span>
    </Field>
  );
}

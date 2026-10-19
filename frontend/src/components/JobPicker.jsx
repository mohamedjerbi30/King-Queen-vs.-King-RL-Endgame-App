import { useEffect } from "react";
import { useAgentOptions } from "../lib/agents.js";
import { usePersistentState } from "../lib/storage.js";
import { Button, Callout, Field, Select } from "../ui/index.jsx";

/** The selected trained agent ("b:<id>" browser / "s:<id>" server), shared by every page. */
export function useSelectedJob() {
  return usePersistentState("selectedJob", "");
}

/** Selectable trained agents (browser + server), newest first. */
export function useJobs() {
  return useAgentOptions();
}

const DOT_TITLE = {
  live: "Server agents update live (WebSocket)",
  polling: "Server agents update every few seconds",
  offline: "Server unreachable — browser agents only",
  browser: "Agents trained in this browser",
};

/** Button that opens the Live Training page (the active page is shared through storage). */
export function TrainAgentLink({ label = "Train an agent →", variant = "primary" }) {
  const [, setMode] = usePersistentState("mode", "play");
  return (
    <Button variant={variant} size="sm" onClick={() => setMode("train")}>
      {label}
    </Button>
  );
}

export default function JobPicker({ tour }) {
  const [jobId, setJobId] = useSelectedJob();
  const { options, loaded, transport } = useJobs();
  const ids = options.map((o) => o.value).join();

  // Runs only when the list changes, so a just-started agent isn't replaced
  // before it appears; also converts ids saved without a prefix.
  useEffect(() => {
    if (!loaded) return;
    setJobId((cur) => {
      if (options.length === 0) return "";
      const fixed = cur && !cur.includes(":") ? `s:${cur}` : cur;
      return options.some((o) => o.value === fixed) ? fixed : options[0].value;
    });
  }, [loaded, ids, setJobId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loaded && options.length === 0) {
    return (
      <Callout tone="warn" tour={tour}>
        <div className="empty-agent">
          <span>
            <strong>No trained agent yet.</strong> Train one in Live Training — it runs in your browser and takes from a few
            seconds (quick demo) to about a minute (the report's full 20-million-decision budget).
          </span>
          <TrainAgentLink />
        </div>
      </Callout>
    );
  }

  return (
    <Field
      label="Trained agent"
      tour={tour}
      info="Agents you trained in Live Training. Browser agents are saved in this browser (IndexedDB) and work anywhere, including the hosted version."
    >
      <span className="inline-controls">
        <Select value={jobId} onChange={setJobId} options={options.length ? options : [{ value: "", label: "Loading…" }]} disabled={!options.length} />
        <span className={`live-dot live-${transport === "browser" ? "live" : transport}`} title={DOT_TITLE[transport]} />
      </span>
    </Field>
  );
}

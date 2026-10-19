import { useEffect } from "react";
import { useAgentOptions } from "../lib/agents.js";
import { usePersistentState } from "../lib/storage.js";
import { Field, Select } from "../ui/index.jsx";

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

  const selectOptions = options.length ? options : [{ value: "", label: "No trained agent yet" }];

  return (
    <Field
      label="Trained agent"
      tour={tour}
      info="Agents you trained in Live Training. Browser agents are saved in this browser (IndexedDB) and work anywhere, including the hosted version."
      hint={options.length === 0 ? "Go to Live Training and train one first — it trains right here in your browser." : null}
    >
      <span className="inline-controls">
        <Select value={jobId} onChange={setJobId} options={selectOptions} disabled={!options.length} />
        <span className={`live-dot live-${transport === "browser" ? "live" : transport}`} title={DOT_TITLE[transport]} />
      </span>
    </Field>
  );
}

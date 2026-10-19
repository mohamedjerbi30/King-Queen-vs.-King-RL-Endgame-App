// Live data pushed by the backend over WebSockets, with an automatic polling
// fallback when a socket can't be opened (e.g. a host without WebSockets).
import { useEffect, useState } from "react";
import { api, wsUrl } from "../api.js";

// ---------------------------------------------------------------- job list
// One shared connection for the whole app: every selector subscribes to it,
// so a newly trained agent shows up on every page at the same moment.
const jobsStore = {
  jobs: [],
  loaded: false,
  transport: "connecting",
  subscribers: new Set(),
  ws: null,
  pollTimer: null,
  retryTimer: null,
};

function publishJobs(jobs, transport) {
  jobsStore.jobs = [...jobs].sort((a, b) => b.started_at - a.started_at);
  jobsStore.loaded = true;
  if (transport) jobsStore.transport = transport;
  jobsStore.subscribers.forEach((fn) => fn({ ...jobsStore }));
}

function startJobsPolling() {
  if (jobsStore.pollTimer) return;
  const tick = () => api.trainJobs().then((r) => publishJobs(r.jobs, "polling")).catch(() => publishJobs([], "offline"));
  tick();
  jobsStore.pollTimer = setInterval(tick, 3000);
}

function stopJobsPolling() {
  clearInterval(jobsStore.pollTimer);
  jobsStore.pollTimer = null;
}

function connectJobs() {
  if (jobsStore.ws || jobsStore.subscribers.size === 0) return;
  let opened = false;
  const ws = new WebSocket(wsUrl("/ws/jobs"));
  jobsStore.ws = ws;
  ws.onopen = () => {
    opened = true;
    stopJobsPolling();
  };
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === "jobs") publishJobs(msg.jobs, "live");
  };
  ws.onclose = () => {
    jobsStore.ws = null;
    if (jobsStore.subscribers.size === 0) return;
    startJobsPolling(); // keep the list fresh meanwhile
    jobsStore.retryTimer = setTimeout(connectJobs, opened ? 1000 : 10000);
  };
}

/** Live list of trained agents (newest first). */
export function useLiveJobs() {
  const [state, setState] = useState({ jobs: jobsStore.jobs, loaded: jobsStore.loaded, transport: jobsStore.transport });
  useEffect(() => {
    jobsStore.subscribers.add(setState);
    connectJobs();
    if (!jobsStore.loaded) startJobsPolling(); // first answer fast, even before the socket opens
    return () => {
      jobsStore.subscribers.delete(setState);
      if (jobsStore.subscribers.size === 0) {
        clearTimeout(jobsStore.retryTimer);
        stopJobsPolling();
        jobsStore.ws?.close();
      }
    };
  }, []);
  return state;
}

// ---------------------------------------------------------------- one job
/**
 * Live status of one training job. The server sends only the new curve
 * points in each message; they are appended here. `reconnect` can be bumped
 * to reopen the stream (e.g. after asking for a new exact test).
 * Returns { job, transport: "live" | "polling" | "idle", missing }.
 */
export function useJobStream(jobId, reconnect = 0) {
  const [job, setJob] = useState(null);
  const [transport, setTransport] = useState("idle");
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    setMissing(false);
    if (!jobId) {
      setJob(null);
      setTransport("idle");
      return;
    }
    let closed = false;
    let pollTimer = null;
    let ws = null;

    const poll = () => {
      setTransport("polling");
      const tick = async () => {
        try {
          const s = await api.trainStatus(jobId);
          if (closed) return;
          setJob(s);
          if (s.status !== "running" && s.eval_status !== "running") clearInterval(pollTimer);
        } catch {
          clearInterval(pollTimer);
          if (!closed) setMissing(true); // the server no longer knows this job
        }
      };
      tick();
      pollTimer = setInterval(tick, 1000);
    };

    let finished = false;
    try {
      ws = new WebSocket(wsUrl(`/ws/train/${jobId}`));
      ws.onopen = () => setTransport("live");
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === "error") {
          finished = true;
          setMissing(true);
          ws.close(); // the client closes, for a clean shutdown
        } else if (msg.type === "end") {
          finished = true;
          ws.close();
        } else if (msg.type === "job") {
          setJob((prev) => {
            const base = msg.curve_from === 0 || !prev || prev.job_id !== jobId ? [] : prev.curve.slice(0, msg.curve_from);
            return { ...msg.job, curve: base.concat(msg.curve) };
          });
        }
      };
      ws.onclose = () => {
        if (!closed && !finished) poll(); // socket dropped or unavailable: fall back
        else setTransport("idle");
      };
    } catch {
      poll();
    }

    return () => {
      closed = true;
      clearInterval(pollTimer);
      ws?.close();
    };
  }, [jobId, reconnect]);

  return { job, transport, missing };
}

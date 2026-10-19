// What kind of backend the app is talking to (asked once, shared by all pages).
import { useEffect, useState } from "react";
import { api } from "../api.js";

let cached = null;
let pending = null;
let attempts = 0;
const listeners = new Set();
// A free Render instance sleeps when idle and needs ~1 minute to wake up:
// keep retrying for about 2 minutes before calling the backend unreachable.
const RETRIES = 24, RETRY_MS = 5000;

function load() {
  if (!pending) {
    pending = api
      .health()
      .then((h) => ({
        reachable: true,
        serverless: !!h.serverless,
        // false on serverless hosts and on low-memory servers (e.g. a free 512 MB instance)
        serverTraining: h.server_training ?? !h.serverless,
        lowMemory: !!h.low_memory,
        instance: h.instance,
      }))
      .catch(() => ({ reachable: false, serverless: false, serverTraining: false, lowMemory: false, instance: null }))
      .then((info) => {
        if (!info.reachable && attempts++ < RETRIES) {
          // still waking up (or briefly offline): report "waking" and try again
          cached = { ...info, waking: true };
          listeners.forEach((fn) => fn(cached));
          setTimeout(() => { pending = null; load(); }, RETRY_MS);
          return cached;
        }
        cached = info;
        listeners.forEach((fn) => fn(info));
        return info;
      });
  }
  return pending;
}

/** { reachable, serverless, instance } or null while loading.
 *  serverless = true on hosts like Vercel, where trained agents cannot be kept. */
export function useServerInfo() {
  const [info, setInfo] = useState(cached);
  useEffect(() => {
    listeners.add(setInfo);
    load();
    return () => listeners.delete(setInfo);
  }, []);
  return info;
}

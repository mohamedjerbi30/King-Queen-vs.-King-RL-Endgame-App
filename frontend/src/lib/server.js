// What kind of backend the app is talking to (asked once, shared by all pages).
import { useEffect, useState } from "react";
import { api } from "../api.js";

let cached = null;
let pending = null;
const listeners = new Set();

function load() {
  if (!pending) {
    pending = api
      .health()
      .then((h) => ({ reachable: true, serverless: !!h.serverless, instance: h.instance }))
      .catch(() => ({ reachable: false, serverless: false, instance: null }))
      .then((info) => {
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

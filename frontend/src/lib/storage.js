import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

// All app data in the browser's localStorage lives under this prefix.
// Access can throw (private mode, blocked storage), so every read/write is
// guarded and the app keeps working with in-memory state if storage fails.
const PREFIX = "kqk.";
const EVENT = "kqk-storage";

export function readStored(key, fallback) {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeStored(key, value) {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // storage full or unavailable: state stays in memory only
  }
  // Tell other hooks using the same key (other pages are mounted too) to update.
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { key, value } }));
}

export function clearStored() {
  try {
    Object.keys(window.localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // ignore
  }
}

/** useState that survives reloads and tab switches, shared by key across components. */
export function usePersistentState(key, initial) {
  const [value, setValue] = useState(() => readStored(key, typeof initial === "function" ? initial() : initial));

  useEffect(() => {
    const onChange = (e) => {
      if (e.detail.key === key) setValue(e.detail.value);
    };
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, [key]);

  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  }, [value]);

  const set = useCallback(
    (next) => {
      const v = typeof next === "function" ? next(ref.current) : next;
      if (Object.is(v, ref.current)) return;
      ref.current = v;
      setValue(v);
      writeStored(key, v);
    },
    [key]
  );

  return [value, set];
}

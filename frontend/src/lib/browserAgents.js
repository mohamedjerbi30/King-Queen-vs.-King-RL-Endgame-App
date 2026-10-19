// Tabular agents (MC / SARSA / Expected SARSA / Q-learning, report protocol)
// trained in the visitor's browser (Web Worker), saved in IndexedDB as sparse
// Q-table snapshots and usable by Play / Explore / Results without any server.
import { useEffect, useState } from "react";
import { idb } from "./idb.js";
import { canonicalSquares, greedyIndex, randomStart, rng, sampledTest, sharedIndex, sparseLookup } from "./engine.js";
import { sqName } from "./chess.js";

const V_STAR = 0.927126;
const FORMAT = 2; // agents saved before the h-aware representation (format 1) are dropped

const store = {
  agents: [],          // metadata of every saved agent, newest first
  loaded: false,
  live: {},            // id -> live job object while training in this tab
  workers: {},         // id -> Worker
  subscribers: new Set(),
};
const qCache = new Map(); // id -> { lookup, decisions } for the last loaded snapshot

function emit() {
  const state = { agents: store.agents, loaded: store.loaded, live: { ...store.live } };
  store.subscribers.forEach((fn) => fn(state));
}

async function loadList() {
  try {
    const list = await idb.getAll("agents");
    for (const a of list.filter((x) => x.format !== FORMAT)) { // old board-only Q-tables
      idb.delete("agents", a.id).catch(() => {});
      idb.delete("qtables", a.id).catch(() => {});
    }
    store.agents = list.filter((x) => x.format === FORMAT).sort((a, b) => b.started_at - a.started_at);
  } catch {
    store.agents = [];
  }
  // Runs interrupted by closing the tab are kept as "stopped" with their last snapshot.
  for (const a of store.agents) {
    if (a.status === "running" && !store.workers[a.id]) {
      a.status = "stopped";
      idb.put("agents", a).catch(() => {});
    }
  }
  store.loaded = true;
  emit();
}

async function saveMeta(meta) {
  const i = store.agents.findIndex((a) => a.id === meta.id);
  if (i >= 0) store.agents[i] = meta; else store.agents.unshift(meta);
  emit();
  await idb.put("agents", meta).catch(() => {});
}

const withDerived = (e) => ({ ...e, v_star: V_STAR, pct_of_optimal: (100 * e.mean_return) / V_STAR });

/** Start training in a Web Worker; returns the new agent id. */
export function startBrowserTraining(params) {
  const id = `b${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
  const meta = {
    id, kind: "browser", format: FORMAT, params, status: "running", started_at: Date.now() / 1000,
    decisions_done: 0, decisions_target: params.decisions, episodes_done: 0, epsilon: 1,
    curve: [], evaluations: [], has_qtable: false,
  };
  store.live[id] = { ...meta, job_id: id, eval_status: "idle" };
  saveMeta(meta);

  const worker = new Worker(new URL("../workers/mcTrainer.worker.js", import.meta.url), { type: "module" });
  store.workers[id] = worker;
  // Handle messages strictly in order (saving a snapshot is asynchronous).
  let queue = Promise.resolve();
  worker.onmessage = (e) => {
    queue = queue.then(() => handle(e.data)).catch(() => {});
  };
  const handle = async (msg) => {
    const live = store.live[id];
    if (!live) return;
    if (msg.type === "progress") {
      live.decisions_done = msg.decisions_done;
      live.episodes_done = msg.episodes_done;
      live.epsilon = msg.epsilon;
      if (msg.curve.length) live.curve = live.curve.concat(msg.curve);
      if (msg.evaluations.length) live.evaluations = live.evaluations.concat(msg.evaluations.map(withDerived));
      store.live[id] = { ...live };
      emit();
    } else if (msg.type === "snapshot") {
      await idb.put("qtables", { idx: msg.idx, q: msg.q, visits: msg.visits }, id).catch(() => {});
      qCache.delete(id);
      const { job_id: _j, eval_status: _e, ...m } = store.live[id];
      await saveMeta({ ...m, has_qtable: true, snapshot_decisions: msg.decisions_done, visited: msg.idx.length });
      store.live[id] = { ...store.live[id], has_qtable: true };
    } else if (msg.type === "done") {
      const { job_id: _j, eval_status: _e, ...m } = store.live[id];
      await saveMeta({ ...m, status: msg.status, has_qtable: true, finished_at: Date.now() / 1000 });
      worker.terminate();
      delete store.workers[id];
      delete store.live[id];
      emit();
    }
  };
  worker.postMessage({ type: "start", params, seed: Math.floor(Math.random() * 2 ** 31) });
  return id;
}

export function stopBrowserTraining(id) {
  store.workers[id]?.postMessage({ type: "stop" });
}

export async function deleteBrowserAgent(id) {
  stopBrowserTraining(id);
  store.agents = store.agents.filter((a) => a.id !== id);
  qCache.delete(id);
  emit();
  await idb.delete("agents", id).catch(() => {});
  await idb.delete("qtables", id).catch(() => {});
}

export async function clearBrowserAgents() {
  Object.keys(store.workers).forEach(stopBrowserTraining);
  store.agents = [];
  qCache.clear();
  emit();
  await idb.clear("agents").catch(() => {});
  await idb.clear("qtables").catch(() => {});
}

/** Load (and cache) an agent's sparse Q-table snapshot. */
export async function loadAgent(id) {
  const meta = store.agents.find((a) => a.id === id);
  const cached = qCache.get(id);
  if (cached && cached.decisions === meta?.snapshot_decisions) return cached;
  const t = await idb.get("qtables", id);
  if (!t) throw new Error("This agent has no saved Q-table yet — wait for its first checkpoint (10% of the run).");
  const agent = { lookup: sparseLookup(t, meta?.params.q0 ?? 0), decisions: meta?.snapshot_decisions };
  qCache.clear(); // keep only one agent in memory
  qCache.set(id, agent);
  return agent;
}

/** The agent's greedy move at remaining budget h, in the same shape as the server's /agent_move. */
export async function browserAgentMove(id, wk, wq, bk, h) {
  const { lookup } = await loadAgent(id);
  const { move, value } = greedyIndex(lookup.value, wk, wq, bk, Math.max(1, Math.min(40, h)));
  return { piece: move[0] === 0 ? "K" : "Q", dest: move[1], dest_name: sqName(move[1]), value, source: "mc" };
}

/** Learned value and visit count of every legal move at budget h (same shape as /train/qtable). */
export async function browserQValues(id, wk, wq, bk, h) {
  const { lookup } = await loadAgent(id);
  const layer = (Math.max(1, Math.min(40, h)) - 1) * sharedIndex().NS;
  const { moves, idx } = greedyIndex(lookup.value, wk, wq, bk, h);
  const rows = moves.map(([p, d], i) => ({
    piece: p === 0 ? "K" : "Q", dest: d, dest_name: sqName(d),
    q: lookup.value(layer + idx[i]), visits: lookup.visits(layer + idx[i]),
  }));
  rows.sort((a, b) => b.q - a.q);
  const c = canonicalSquares(wk, wq, bk);
  return { qvalues: rows, canonical: { wk: sqName(c.wk), wq: sqName(c.wq), bk: sqName(c.bk), symmetry: c.symmetry } };
}

/** Sampled test (5,000 games from h = 40) of a saved agent, run in the page. */
export async function testBrowserAgent(id) {
  const { lookup } = await loadAgent(id);
  const meta = store.agents.find((a) => a.id === id);
  const r = rng(20240901);
  const starts = Array.from({ length: 5000 }, () => randomStart(r));
  const res = withDerived({ ...sampledTest(lookup.value, starts), episodes: meta.snapshot_decisions ?? meta.decisions_done, sampled: true });
  await saveMeta({ ...meta, evaluations: [...meta.evaluations, res] });
  return res;
}

/** { agents, loaded, live } — every saved browser agent plus live training state. */
export function useBrowserAgents() {
  const [state, setState] = useState({ agents: store.agents, loaded: store.loaded, live: store.live });
  useEffect(() => {
    store.subscribers.add(setState);
    if (!store.loaded) loadList();
    return () => store.subscribers.delete(setState);
  }, []);
  return state;
}

/** A job-shaped object for one browser agent (live while training, saved otherwise). */
export function useBrowserJob(id) {
  const { agents, live } = useBrowserAgents();
  if (!id) return null;
  if (live[id]) return live[id];
  const meta = agents.find((a) => a.id === id);
  return meta ? { ...meta, job_id: meta.id, eval_status: "idle" } : null;
}

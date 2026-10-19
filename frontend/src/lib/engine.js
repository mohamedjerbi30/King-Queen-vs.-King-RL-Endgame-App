// King + Queen vs King rules and the report's tabular learners (MC mean, MC
// constant, SARSA, Expected SARSA, Q-learning), in plain JavaScript so an agent
// can be trained in the browser (no server needed). Rules and symmetries are a
// port of backend/app/chess_engine.py and state_space.py (cross-checked).
//
// Squares are 0..63 (file = sq % 8, rank = sq >> 3). Pieces: 0 = king, 1 = queen.

export const GAMMA = 0.99;
export const STEP_REWARD = -0.01;
export const WIN = 1;
export const LOSS = -1;

// ---------------------------------------------------------------- tables
const KING_NB = [];   // KING_NB[sq] = neighbour squares
const RAYS = [];      // RAYS[sq] = 8 rays, each an array of squares outward
const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
for (let sq = 0; sq < 64; sq++) {
  const f = sq % 8, r = sq >> 3;
  KING_NB.push(DIRS.map(([df, dr]) => [f + df, r + dr]).filter(([a, b]) => a >= 0 && a < 8 && b >= 0 && b < 8).map(([a, b]) => b * 8 + a));
  RAYS.push(DIRS.map(([df, dr]) => {
    const ray = [];
    for (let a = f + df, b = r + dr; a >= 0 && a < 8 && b >= 0 && b < 8; a += df, b += dr) ray.push(b * 8 + a);
    return ray;
  }));
}
const ADJ = Array.from({ length: 64 }, (_, a) => {
  const row = new Uint8Array(64);
  for (const b of KING_NB[a]) row[b] = 1;
  return row;
});

// 8 board symmetries (dihedral group), same order as state_space._transform.
const SYM = [];
for (let k = 0; k < 8; k++) {
  const t = new Uint8Array(64);
  for (let sq = 0; sq < 64; sq++) {
    const f = sq % 8, r = sq >> 3;
    const [nf, nr] = [[f, r], [r, 7 - f], [7 - f, 7 - r], [7 - r, f], [7 - f, r], [f, 7 - r], [r, f], [7 - r, 7 - f]][k];
    t[sq] = nr * 8 + nf;
  }
  SYM.push(t);
}

// ---------------------------------------------------------------- rules
export const adjacent = (a, b) => ADJ[a][b] === 1;

/** Does the queen on q attack target t? `blocker` (or -1) stops the ray. */
function queenHits(q, t, blocker) {
  for (const ray of RAYS[q]) {
    for (const s of ray) {
      if (s === t) return true;
      if (s === blocker) break;
    }
  }
  return false;
}

export function blackInCheck(wk, wq, bk) {
  return adjacent(wk, bk) || queenHits(wq, bk, wk);
}

/** Legal White moves as [piece, dest] pairs: king first, then queen. */
export function whiteMoves(wk, wq, bk) {
  const out = [];
  for (const d of KING_NB[wk]) {
    if (d === wq || d === bk || adjacent(d, bk)) continue;
    out.push([0, d]);
  }
  for (const ray of RAYS[wq]) {
    for (const s of ray) {
      if (s === wk || s === bk) break; // own king blocks; cannot capture the king
      out.push([1, s]);
    }
  }
  return out;
}

/** Legal Black king destinations (the black king is not a blocker for its own move). */
export function blackMoves(wk, wq, bk) {
  const out = [];
  for (const d of KING_NB[bk]) {
    if (d === wk || adjacent(d, wk)) continue;
    if (d !== wq && queenHits(wq, d, wk)) continue;
    out.push(d);
  }
  return out;
}

/** "checkmate" | "stalemate" | "ongoing" right after White's move. */
export function classify(wk, wq, bk) {
  if (blackMoves(wk, wq, bk).length) return "ongoing";
  return blackInCheck(wk, wq, bk) ? "checkmate" : "stalemate";
}

/** One RL step: White moves, then Black replies at random if the game goes on. */
export function step(wk, wq, bk, movesLeft, piece, dest, rand) {
  if (piece === 0) wk = dest; else wq = dest;
  const outcome = classify(wk, wq, bk);
  if (outcome === "checkmate") return { reward: WIN, done: true, outcome };
  if (outcome === "stalemate") return { reward: LOSS, done: true, outcome };
  if (movesLeft - 1 <= 0) return { reward: LOSS, done: true, outcome: "budget_exhausted" };
  const replies = blackMoves(wk, wq, bk);
  const reply = replies[Math.floor(rand() * replies.length)];
  if (reply === wq) return { reward: LOSS, done: true, outcome: "queen_captured", reply };
  return { reward: STEP_REWARD, done: false, outcome: null, reply, next: [wk, wq, reply, movesLeft - 1] };
}

/** Random legal White-to-move position (Black not in check), as the backend does. */
export function randomStart(rand) {
  for (;;) {
    const wk = Math.floor(rand() * 64), wq = Math.floor(rand() * 64), bk = Math.floor(rand() * 64);
    if (wk === wq || wk === bk || wq === bk || adjacent(wk, bk) || blackInCheck(wk, wq, bk)) continue;
    return [wk, wq, bk];
  }
}

/** Seeded random generator (mulberry32). */
export function rng(seed = (Math.random() * 2 ** 32) >>> 0) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- symmetry
/** Canonical board (lexicographically smallest image) and the symmetry k used. */
export function canonical(wk, wq, bk) {
  let best = Infinity, bestK = 0;
  for (let k = 0; k < 8; k++) {
    const t = SYM[k];
    const code = t[wk] * 4096 + t[wq] * 64 + t[bk];
    if (code < best) { best = code; bestK = k; }
  }
  return { code: best, k: bestK };
}

/** Q-table key of (board, move): canonical board code * 128 + piece * 64 + canonical destination. */
export const qKey = (canon, piece, dest) => canon.code * 128 + piece * 64 + SYM[canon.k][dest];

/** The canonical squares, for display ("this board is stored as …"). */
export function canonicalSquares(wk, wq, bk) {
  const c = canonical(wk, wq, bk);
  return { wk: Math.floor(c.code / 4096), wq: Math.floor(c.code / 64) % 64, bk: c.code % 64, symmetry: c.k };
}

// ---------------------------------------------------------------- tabular agents
// Same representation and protocol as the final report (Chapter 4):
//   key = (h - 1) * NS + shared(board, action)
// where shared() indexes the 499,496 symmetry-shared (board, action) pairs and
// h in 1..40 is the remaining budget — the deadline is never merged away.

export const H = 40;
let INDEX = null; // { repOf: Int32Array(262144), base: Int32Array, slot: Int32Array, NS, nReps }

/** Enumerate canonical boards and their legal actions once (~0.2 s). */
export function sharedIndex() {
  if (INDEX) return INDEX;
  const repOf = new Int32Array(262144).fill(-1);
  const baseList = [], slotList = [];
  let NS = 0;
  for (let wk = 0; wk < 64; wk++) {
    for (let wq = 0; wq < 64; wq++) {
      if (wq === wk) continue;
      for (let bk = 0; bk < 64; bk++) {
        if (bk === wk || bk === wq || adjacent(wk, bk) || blackInCheck(wk, wq, bk)) continue;
        const code = wk * 4096 + wq * 64 + bk;
        if (canonical(wk, wq, bk).code !== code || repOf[code] !== -1) continue; // only canonical boards
        const r = baseList.length;
        repOf[code] = r;
        baseList.push(NS);
        const slots = new Int32Array(128).fill(-1);
        for (const [p, d] of whiteMoves(wk, wq, bk)) slots[p * 64 + d] = NS++ - baseList[r];
        slotList.push(slots);
      }
    }
  }
  const slot = new Int32Array(baseList.length * 128);
  slotList.forEach((s, r) => slot.set(s, r * 128));
  INDEX = { repOf, base: Int32Array.from(baseList), slot, NS, nReps: baseList.length };
  return INDEX;
}

/** Shared indices of the given legal moves of a board (one canonicalisation per state). */
export function moveIndices(wk, wq, bk, moves) {
  const ix = sharedIndex();
  const c = canonical(wk, wq, bk);
  const r = ix.repOf[c.code];
  const t = SYM[c.k], base = ix.base[r], off = r * 128;
  const out = new Int32Array(moves.length);
  for (let i = 0; i < moves.length; i++) out[i] = base + ix.slot[off + moves[i][0] * 64 + t[moves[i][1]]];
  return out;
}

export const METHODS = {
  mc_mean: "MC (mean, 1/N)",
  mc_const: "MC (constant α)",
  sarsa: "SARSA",
  expected_sarsa: "Expected SARSA",
  qlearning: "Q-learning",
};

/** The report's exploration schedule: max(0.02, (1 + D/10,000)^-1/2), D = decisions so far. */
export const epsilonAt = (D) => Math.max(0.02, 1 / Math.sqrt(1 + D / 10000));

export function newAgent({ method, alpha = 0.1, q0 = 0 }) {
  const { NS } = sharedIndex();
  const Q = new Float32Array(H * NS);
  if (q0) Q.fill(q0);
  return { method, alpha, q0, NS, Q, N: new Uint32Array(H * NS), decisions: 0, episodes: 0 };
}

function pick(Q, layer, idx, eps, rand) {
  if (rand() < eps) return Math.floor(rand() * idx.length);
  let best = -Infinity, n = 0, choice = 0;
  for (let i = 0; i < idx.length; i++) {
    const v = Q[layer + idx[i]];
    if (v > best) { best = v; n = 1; choice = i; }
    else if (v === best && rand() * ++n < 1) choice = i; // uniform among ties
  }
  return choice;
}

function nextValue(agent, layer, idx, eps, rand) {
  // continuation value of the next state for SARSA / Expected SARSA / Q-learning
  const { Q, method } = agent;
  let max = -Infinity, sum = 0;
  for (let i = 0; i < idx.length; i++) {
    const v = Q[layer + idx[i]];
    if (v > max) max = v;
    sum += v;
  }
  if (method === "qlearning") return { value: max };
  if (method === "expected_sarsa") return { value: (1 - eps) * max + (eps * sum) / idx.length };
  const a = pick(Q, layer, idx, eps, rand); // SARSA: sample a' now, reuse it next step
  return { value: Q[layer + idx[a]], next: a };
}

/**
 * One training episode (complete, even if it overshoots the budget).
 * Reset: uniform valid board and uniform h in 1..40; epsilon fixed for the episode.
 */
export function trainEpisode(agent, rand) {
  const { Q, N, NS, method, alpha } = agent;
  const eps = epsilonAt(agent.decisions);
  let [wk, wq, bk] = randomStart(rand);
  let h = 1 + Math.floor(rand() * H);
  let moves = whiteMoves(wk, wq, bk), idx = moveIndices(wk, wq, bk, moves);
  let a = pick(Q, (h - 1) * NS, idx, eps, rand);
  const mc = method === "mc_mean" || method === "mc_const";
  const keys = [], rewards = [];
  let outcome, steps = 0, ret = 0, disc = 1;
  for (;;) {
    const key = (h - 1) * NS + idx[a];
    const res = step(wk, wq, bk, h, moves[a][0], moves[a][1], rand);
    steps++;
    ret += disc * res.reward;
    disc *= GAMMA;
    if (mc) { keys.push(key); rewards.push(res.reward); }
    if (res.done) {
      outcome = res.outcome;
      if (!mc) { N[key]++; Q[key] += alpha * (res.reward - Q[key]); } // terminal: no bootstrap
      break;
    }
    [wk, wq, bk, h] = res.next;
    moves = whiteMoves(wk, wq, bk);
    idx = moveIndices(wk, wq, bk, moves);
    if (mc) {
      a = pick(Q, (h - 1) * NS, idx, eps, rand);
    } else {
      const nv = nextValue(agent, (h - 1) * NS, idx, eps, rand);
      N[key]++;
      Q[key] += alpha * (res.reward + GAMMA * nv.value - Q[key]);
      a = nv.next !== undefined ? nv.next : pick(Q, (h - 1) * NS, idx, eps, rand);
    }
  }
  if (mc) {
    // h decreases every step, so a (state, action) never repeats: first-visit = every-visit
    let G = 0;
    for (let t = keys.length - 1; t >= 0; t--) {
      G = rewards[t] + GAMMA * G;
      const k = keys[t];
      N[k]++;
      Q[k] += (method === "mc_mean" ? 1 / N[k] : alpha) * (G - Q[k]);
    }
  }
  agent.decisions += steps;
  agent.episodes++;
  return { outcome, steps, ret };
}

/** Deterministic greedy action (first maximum in legal-move order), as in the report's evaluation. */
export function greedyIndex(lookup, wk, wq, bk, h) {
  const moves = whiteMoves(wk, wq, bk);
  const idx = moveIndices(wk, wq, bk, moves);
  const NS = sharedIndex().NS;
  let best = -Infinity, choice = 0;
  for (let i = 0; i < idx.length; i++) {
    const v = lookup((h - 1) * NS + idx[i]);
    if (v > best) { best = v; choice = i; }
  }
  return { move: moves[choice], value: best, moves, idx };
}

/** Test the frozen greedy policy on fixed starts at h = 40 (sampled, ~±0.01 on the return). */
export function sampledTest(lookup, starts, seed = 12345) {
  const rand = rng(seed);
  let sumRet = 0, sumSq = 0, mates = 0, mateMoves = 0;
  for (const [s0, s1, s2] of starts) {
    let wk = s0, wq = s1, bk = s2, h = H, g = 0, disc = 1, n = 0;
    for (;;) {
      const { move } = greedyIndex(lookup, wk, wq, bk, h);
      const res = step(wk, wq, bk, h, move[0], move[1], rand);
      g += disc * res.reward;
      disc *= GAMMA;
      n++;
      if (res.done) {
        if (res.outcome === "checkmate") { mates++; mateMoves += n; }
        break;
      }
      [wk, wq, bk, h] = res.next;
    }
    sumRet += g;
    sumSq += g * g;
  }
  const M = starts.length, mean = sumRet / M;
  return {
    mean_return: mean,
    mean_return_se: Math.sqrt(Math.max(0, sumSq / M - mean * mean) / M),
    mate_rate: mates / M,
    mean_moves_to_mate: mates ? mateMoves / mates : null,
    n_games: M,
  };
}

/** Sparse snapshot (visited entries only), in ascending index order. */
export function sparseSnapshot(agent) {
  const { Q, N } = agent;
  let n = 0;
  for (let i = 0; i < N.length; i++) if (N[i]) n++;
  const idx = new Int32Array(n), q = new Float32Array(n), visits = new Uint32Array(n);
  for (let i = 0, j = 0; i < N.length; i++) {
    if (N[i]) { idx[j] = i; q[j] = Q[i]; visits[j] = N[i]; j++; }
  }
  return { idx, q, visits };
}

/** Value lookup over a sparse snapshot (binary search); unvisited entries return q0. */
export function sparseLookup(snap, q0 = 0) {
  const { idx, q, visits } = snap;
  const find = (key) => {
    let lo = 0, hi = idx.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1, v = idx[mid];
      if (v === key) return mid;
      if (v < key) lo = mid + 1; else hi = mid - 1;
    }
    return -1;
  };
  return {
    value: (key) => { const i = find(key); return i < 0 ? q0 : q[i]; },
    visits: (key) => { const i = find(key); return i < 0 ? 0 : visits[i]; },
  };
}

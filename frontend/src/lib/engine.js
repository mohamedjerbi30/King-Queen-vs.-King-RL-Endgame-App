// King + Queen vs King rules and first-visit Monte Carlo control, in plain
// JavaScript so an agent can be trained in the browser (no server needed).
// A faithful port of backend/app/chess_engine.py, state_space.py and
// mc_agent.py: same rules, same rewards, same symmetry reduction, same update.
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

// ---------------------------------------------------------------- agent
/** Greedy move of a Q-table (ties broken at random). */
export function greedy(Q, q0, wk, wq, bk, rand) {
  const canon = canonical(wk, wq, bk);
  let bestVal = -Infinity, best = [];
  for (const m of whiteMoves(wk, wq, bk)) {
    const v = Q.get(qKey(canon, m[0], m[1])) ?? q0;
    if (v > bestVal) { bestVal = v; best = [m]; }
    else if (v === bestVal) best.push(m);
  }
  return { move: best[Math.floor(rand() * best.length)], value: bestVal };
}

/**
 * One first-visit Monte Carlo episode with constant step size, exactly like
 * MCAgent.run_episode: epsilon-greedy White, random Black, returns computed
 * backwards, only the first visit of each (state, move) updated.
 */
export function runEpisode(agent, budget, rand) {
  const { Q, visits, alpha, epsilon, q0 } = agent;
  let [wk, wq, bk] = randomStart(rand);
  let movesLeft = budget;
  const keys = [], rewards = [];
  let outcome;
  for (;;) {
    const canon = canonical(wk, wq, bk);
    const moves = whiteMoves(wk, wq, bk);
    let m;
    if (rand() < epsilon) m = moves[Math.floor(rand() * moves.length)];
    else {
      let bestVal = -Infinity, best = [];
      for (const mv of moves) {
        const v = Q.get(qKey(canon, mv[0], mv[1])) ?? q0;
        if (v > bestVal) { bestVal = v; best = [mv]; }
        else if (v === bestVal) best.push(mv);
      }
      m = best[Math.floor(rand() * best.length)];
    }
    keys.push(qKey(canon, m[0], m[1]));
    const res = step(wk, wq, bk, movesLeft, m[0], m[1], rand);
    rewards.push(res.reward);
    if (res.done) { outcome = res.outcome; break; }
    [wk, wq, bk, movesLeft] = res.next;
  }
  const G = new Array(keys.length);
  let running = 0;
  for (let t = keys.length - 1; t >= 0; t--) {
    running = rewards[t] + GAMMA * running;
    G[t] = running;
  }
  const seen = new Set();
  for (let t = 0; t < keys.length; t++) {
    const key = keys[t];
    if (seen.has(key)) continue;
    seen.add(key);
    const old = Q.get(key) ?? q0;
    Q.set(key, old + alpha * (G[t] - old));
    visits.set(key, (visits.get(key) || 0) + 1);
  }
  return { outcome, length: keys.length, ret: G[0] };
}

/**
 * Test the greedy policy (no exploration) on fixed random starting positions.
 * Without the server's DP model this is an estimate (sampling), not exact.
 */
export function sampledTest(agent, starts, budget, seed = 12345) {
  const rand = rng(seed);
  let sumRet = 0, sumSq = 0, mates = 0, mateMoves = 0;
  for (const [s0, s1, s2] of starts) {
    let wk = s0, wq = s1, bk = s2, movesLeft = budget, g = 0, disc = 1, n = 0;
    for (;;) {
      const { move } = greedy(agent.Q, agent.q0, wk, wq, bk, rand);
      const res = step(wk, wq, bk, movesLeft, move[0], move[1], rand);
      g += disc * res.reward;
      disc *= GAMMA;
      n++;
      if (res.done) {
        if (res.outcome === "checkmate") { mates++; mateMoves += n; }
        break;
      }
      [wk, wq, bk, movesLeft] = res.next;
    }
    sumRet += g;
    sumSq += g * g;
  }
  const N = starts.length;
  const mean = sumRet / N;
  return {
    mean_return: mean,
    mean_return_se: Math.sqrt(Math.max(0, sumSq / N - mean * mean) / N),
    mate_rate: mates / N,
    mean_moves_to_mate: mates ? mateMoves / mates : null,
    n_games: N,
  };
}

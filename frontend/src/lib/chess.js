// Square names, move notation and the "mate in N" reading of a value.

const FILES = "abcdefgh";

export const sqName = (sq) => `${FILES[sq % 8]}${Math.floor(sq / 8) + 1}`;

export function sqFromName(name) {
  const s = (name || "").trim().toLowerCase();
  const f = FILES.indexOf(s[0]);
  const r = parseInt(s.slice(1), 10) - 1;
  if (f < 0 || !(r >= 0 && r < 8) || s.length !== 2) return null;
  return r * 8 + f;
}

/** Algebraic notation for our three pieces: "Qg6", "Kb6", Black "Kd8". */
export const moveLabel = (piece, dest) => `${piece}${typeof dest === "number" ? sqName(dest) : dest}`;

/** Numbered game record from a list of plies [{white, black?, result?}]. */
export function gameRecord(moves) {
  return moves.map((m, i) => `${i + 1}. ${m.white}${m.black ? ` ${m.black}` : ""}${m.result ? ` ${m.result}` : ""}`);
}

const fr = (sq) => [sq % 8, Math.floor(sq / 8)];

const adjacent = (a, b) => {
  const [fa, ra] = fr(a), [fb, rb] = fr(b);
  return Math.max(Math.abs(fa - fb), Math.abs(ra - rb)) === 1;
};

function queenAttacks(q, t, blocker) {
  const [fq, rq] = fr(q), [ft, rt] = fr(t);
  if (!(fq === ft || rq === rt || Math.abs(ft - fq) === Math.abs(rt - rq))) return false;
  const df = Math.sign(ft - fq), dr = Math.sign(rt - rq);
  let f = fq + df, r = rq + dr;
  while (f !== ft || r !== rt) {
    if (r * 8 + f === blocker) return false;
    f += df;
    r += dr;
  }
  return true;
}

/** Same rule as the backend: null if (wk, wq, bk) is a legal White-to-move position. */
export function positionError(wk, wq, bk) {
  if (wk === null || wq === null || bk === null) return "Enter three valid squares (a1 … h8).";
  if (new Set([wk, wq, bk]).size !== 3) return "Two pieces are on the same square.";
  if (adjacent(wk, bk)) return "The two kings are next to each other.";
  if (queenAttacks(wq, bk, wk)) return "Black is in check — it would be Black's turn, not White's.";
  return null;
}

// ---- reading a value ----------------------------------------------------
// With +1 for mate, -0.01 per move and gamma = 0.99, a mate on White's n-th
// move is worth exactly q = 2 * 0.99^(n-1) - 1. Inverting it turns any value
// into an equivalent "mate in N" that people can read.
const GAMMA = 0.99;

export function mateIn(q) {
  if (q === null || q === undefined) return null;
  if (q >= 0.99995) return 1;
  if (q <= 0) return Infinity;
  return 1 + Math.log((q + 1) / 2) / Math.log(GAMMA);
}

/** Short tag text for a value: "M1", "M2", "≈M3", "risky", "✗". */
export function valueTag(q) {
  const n = mateIn(q);
  if (n === Infinity) return "✗";
  if (n > 40) return "risky";
  const r = Math.round(n);
  return Math.abs(n - r) < 0.05 ? `M${r}` : `≈M${r}`;
}

/** Plain-language meaning of a value. */
export function valueMeaning(q) {
  const n = mateIn(q);
  if (n === 1) return "mates immediately";
  if (n === Infinity) return "blunder — likely stalemate, losing the queen or running out of moves";
  if (n > 40) return "risky — often fails (stalemate / queen loss) on average";
  const r = Math.round(n);
  return Math.abs(n - r) < 0.05 ? `forced mate in ${r}` : `about mate in ${r} on average`;
}

/** Grade a move against the best move of the same position. */
export function grade(q, best) {
  if (q <= 0) return "blunder";
  if (Math.abs(q - best) < 1e-9) return "best";
  const slower = mateIn(q) - mateIn(best);
  if (slower <= 1.5) return "close";
  if (slower <= 3.5) return "slower";
  return "poor";
}

export const GRADE = {
  best: { color: "#2F6B55", label: "best" },
  close: { color: "#7A9A3E", label: "≈1 move slower" },
  slower: { color: "#CC8A2C", label: "2–3 moves slower" },
  poor: { color: "#B8683E", label: "much slower" },
  blunder: { color: "#B1503E", label: "blunder" },
  unknown: { color: "#9AA1AC", label: "never tried" },
};

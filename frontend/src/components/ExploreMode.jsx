import { useCallback, useEffect, useState } from "react";
import ChessBoard from "./ChessBoard.jsx";
import JobPicker from "./JobPicker.jsx";
import { api } from "../api.js";

const FILES = "abcdefgh";
const sqName = (sq) => `${FILES[sq % 8]}${Math.floor(sq / 8) + 1}`;
const fr = (sq) => [sq % 8, Math.floor(sq / 8)];

function sqFromName(name) {
  const f = FILES.indexOf((name || "")[0]);
  const r = parseInt((name || "").slice(1), 10) - 1;
  if (f < 0 || !(r >= 0 && r < 8)) return null;
  return r * 8 + f;
}

const adjacent = (a, b) => {
  const [fa, ra] = fr(a), [fb, rb] = fr(b);
  return Math.max(Math.abs(fa - fb), Math.abs(ra - rb)) === 1;
};

// Does the queen on q attack square t, with `blocker` possibly in the way?
function queenAttacks(q, t, blocker) {
  const [fq, rq] = fr(q), [ft, rt] = fr(t);
  const df = Math.sign(ft - fq), dr = Math.sign(rt - rq);
  if (!(fq === ft || rq === rt || Math.abs(ft - fq) === Math.abs(rt - rq))) return false;
  let f = fq + df, r = rq + dr;
  while (f !== ft || r !== rt) {
    if (r * 8 + f === blocker) return false;
    f += df;
    r += dr;
  }
  return true;
}

// Same rules as the backend: a White-to-move state needs distinct squares,
// non-adjacent kings, and Black NOT in check.
function positionError(wk, wq, bk) {
  if (wk === null || wq === null || bk === null) return "Enter three valid squares (a1 … h8).";
  if (new Set([wk, wq, bk]).size !== 3) return "Two pieces are on the same square.";
  if (adjacent(wk, bk)) return "The two kings are adjacent — illegal.";
  if (queenAttacks(wq, bk, wk)) return "Black is in check — that would be Black's turn, not White's.";
  return null;
}

// q in [-1, 1] -> rust (bad) / gold (middling) / sage (good)
function qColor(q) {
  if (q >= 0.8) return "#3C6B5C";
  if (q >= 0) return "#CC8A2C";
  return "#B1503E";
}

const KIND_LABEL = { checkmate: "mate", stalemate: "stalemate" };

export default function ExploreMode() {
  // Default = the position from the "State" slide: Kc6, Qe4 vs Ka8 (White to move, legal).
  const [wkName, setWkName] = useState("c6");
  const [wqName, setWqName] = useState("e4");
  const [bkName, setBkName] = useState("a8");
  const [movesLeft, setMovesLeft] = useState(40);
  const [setupMode, setSetupMode] = useState(false);
  const [placing, setPlacing] = useState("wk");
  const [selectedPiece, setSelectedPiece] = useState(null); // 'K' | 'Q' while choosing a move
  const [lastMove, setLastMove] = useState(null);
  const [source, setSource] = useState("dp");
  const [jobId, setJobId] = useState("");
  const [dpStatus, setDpStatus] = useState(null);
  const [rows, setRows] = useState([]);
  const [value, setValue] = useState(null);
  const [canonical, setCanonical] = useState(null);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const wk = sqFromName(wkName), wq = sqFromName(wqName), bk = sqFromName(bkName);
  const posError = positionError(wk, wq, bk);
  const dpReady = dpStatus?.status === "ready";

  useEffect(() => {
    api.dpStatus().then(setDpStatus).catch((e) => setError(e.message));
  }, []);

  async function solveDp() {
    setBusy(true);
    try {
      await api.dpSolve(40);
      const poll = setInterval(async () => {
        const s = await api.dpStatus();
        setDpStatus(s);
        if (s.status === "ready" || s.status === "error") clearInterval(poll);
      }, 1500);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const query = useCallback(async () => {
    setError(null);
    if (posError) {
      setRows([]);
      setValue(null);
      return;
    }
    if (source === "dp" && !dpReady) return;
    if (source === "mc" && !jobId) {
      setError("No training job yet — start one in Live Training.");
      return;
    }
    setBusy(true);
    try {
      if (source === "dp") {
        const res = await api.dpQuery(wk, wq, bk, movesLeft);
        setValue(res.value);
        setRows(res.qvalues);
        setCanonical(null);
      } else {
        const res = await api.trainQtable(jobId, wk, wq, bk);
        const best = res.qvalues.length ? res.qvalues[0].q : null;
        setRows(res.qvalues.map((r) => ({ ...r, optimal: Math.abs(r.q - best) < 1e-12 })));
        setValue(best);
        setCanonical(res.canonical);
      }
    } catch (e) {
      setError(e.message);
      setRows([]);
      setValue(null);
    } finally {
      setBusy(false);
    }
  }, [posError, source, dpReady, jobId, wk, wq, bk, movesLeft]);

  // Re-inspect automatically whenever the position or the source changes.
  useEffect(() => {
    query();
  }, [query]);

  function resetTo(newWk, newWq, newBk) {
    setWkName(sqName(newWk));
    setWqName(sqName(newWq));
    setBkName(sqName(newBk));
    setSelectedPiece(null);
  }

  async function playMove(piece, dest) {
    setBusy(true);
    setError(null);
    try {
      const res = await api.step({ wk, wq, bk, moves_left: movesLeft }, piece, dest);
      const from = piece === "K" ? wk : wq;
      setLastMove({ from, to: dest });
      const label = `${piece === "K" ? "♔" : "♕"}${sqName(dest)}`;
      if (res.done) {
        setMessage(`${label} → game over: ${res.outcome} (reward ${res.reward}). Set up a new position to continue.`);
        if (piece === "K") setWkName(sqName(dest));
        else setWqName(sqName(dest));
        setRows([]);
        setSetupMode(true);
      } else {
        setMessage(`You played ${label}; Black replied ♚${res.black_reply}. Values below are for the new position.`);
        resetTo(res.position.wk, res.position.wq, res.position.bk);
        setMovesLeft(res.position.moves_left);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      setSelectedPiece(null);
    }
  }

  function handleSquareClick(sq) {
    if (busy) return;
    if (setupMode) {
      const others = { wk: [wq, bk], wq: [wk, bk], bk: [wk, wq] }[placing];
      if (others.includes(sq)) {
        setError("That square is occupied — pick an empty square.");
        return;
      }
      ({ wk: setWkName, wq: setWqName, bk: setBkName })[placing](sqName(sq));
      setLastMove(null);
      setMessage(null);
      return;
    }
    // Move mode: pieces only go where the rules allow.
    if (sq === wk) return setSelectedPiece("K");
    if (sq === wq) return setSelectedPiece("Q");
    if (selectedPiece) {
      const mv = rows.find((r) => r.piece === selectedPiece && r.dest === sq);
      if (mv) playMove(mv.piece, mv.dest);
      else setSelectedPiece(null);
    }
  }

  // Tags: only the selected piece's moves, or (nothing selected) the best value per square.
  const shown = selectedPiece ? rows.filter((r) => r.piece === selectedPiece) : rows;
  const labels = {};
  for (const r of shown) {
    if (!labels[r.dest] || labels[r.dest].q < r.q) {
      labels[r.dest] = { q: r.q, text: r.q.toFixed(2), color: qColor(r.q) };
    }
  }
  const nUnseen = rows.filter((r) => r.visits === 0).length;

  return (
    <div className="panel-grid">
      <div className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        {wk !== null && wq !== null && bk !== null && (
          <ChessBoard
            wk={wk} wq={wq} bk={bk}
            squareLabels={labels}
            onSquareClick={handleSquareClick}
            lastMove={lastMove}
          />
        )}

        <div style={{ display: "flex", gap: 8, width: "100%" }}>
          <button className={!setupMode ? "primary" : "secondary"} style={{ flex: 1 }} onClick={() => { setSetupMode(false); setSelectedPiece(null); }}>
            Move pieces (legal moves only)
          </button>
          <button className={setupMode ? "primary" : "secondary"} style={{ flex: 1 }} onClick={() => { setSetupMode(true); setSelectedPiece(null); }}>
            Set up a position
          </button>
        </div>

        {setupMode ? (
          <div className="field-row" style={{ width: "100%" }}>
            <span>Click an empty square to put:</span>
            <span style={{ display: "flex", gap: 10 }}>
              <label><input type="radio" checked={placing === "wk"} onChange={() => setPlacing("wk")} /> ♔ White king</label>
              <label><input type="radio" checked={placing === "wq"} onChange={() => setPlacing("wq")} /> ♕ Queen</label>
              <label><input type="radio" checked={placing === "bk"} onChange={() => setPlacing("bk")} /> ♚ Black king</label>
            </span>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: "var(--muted)", width: "100%" }}>
            {selectedPiece
              ? `Showing the ${selectedPiece === "K" ? "king" : "queen"}'s legal moves only. Click a tag to play it (Black then replies at random), or click elsewhere to deselect.`
              : "Each tag = a square White can legally reach, labelled with the value of the best move landing there. Click the ♔ or ♕ to see only that piece's moves."}
          </div>
        )}

        <div className={`badge ${posError ? "fail" : "success"}`} style={{ alignSelf: "flex-start" }}>
          {posError ? `Illegal position: ${posError}` : "Legal position · White to move"}
        </div>
        {message && <div style={{ fontSize: 13, color: "var(--navy)", width: "100%" }}>{message}</div>}

        <div className="key-rule" style={{ width: "100%" }}>
          <strong>How to read it.</strong> The number on a square is <em>q(s, a)</em>: the expected discounted
          return if White plays that move now and keeps playing well afterwards. 1.00 = mates immediately;
          0.98 = mate next move; ~0.9 = a quick forced mate; ≤ 0 = a blunder (queen can be taken, stalemate or
          timeout). The agent's policy is just "play the highest number" (★ in the list).
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="card2">
          <div className="card-title">Position</div>
          <div className="field-row"><span>White king</span><input type="text" value={wkName} onChange={(e) => setWkName(e.target.value.trim())} style={{ width: 60 }} /></div>
          <div className="field-row"><span>White queen</span><input type="text" value={wqName} onChange={(e) => setWqName(e.target.value.trim())} style={{ width: 60 }} /></div>
          <div className="field-row"><span>Black king</span><input type="text" value={bkName} onChange={(e) => setBkName(e.target.value.trim())} style={{ width: 60 }} /></div>
          <div className="field-row">
            <span>Moves left (h){source === "mc" && " — ignored by MC"}</span>
            <input type="number" min={1} max={40} value={movesLeft} onChange={(e) => setMovesLeft(Math.max(1, Math.min(40, +e.target.value)))} style={{ width: 60 }} disabled={source === "mc"} />
          </div>
        </div>

        <div className="card2">
          <div className="card-title">Source of the values</div>
          <div className="field-row">
            <label><input type="radio" checked={source === "dp"} onChange={() => setSource("dp")} /> Exact q* (DP)</label>
            <label><input type="radio" checked={source === "mc"} onChange={() => setSource("mc")} /> Learned Q (Monte Carlo)</label>
          </div>
          {source === "dp" && dpStatus && !dpReady && (
            <>
              <div style={{ fontSize: 12, color: "var(--rust)", marginBottom: 8 }}>
                DP status: {dpStatus.status}{dpStatus.progress?.stage ? ` (${dpStatus.progress.stage})` : ""}
                {dpStatus.status === "error" && " — this server cannot build the DP (e.g. a read-only serverless host). Run the backend locally with python run.py."}
              </div>
              <button className="secondary" style={{ width: "100%" }} onClick={solveDp} disabled={busy}>Solve DP (one-time, ~3 min cold)</button>
            </>
          )}
          {source === "mc" && <JobPicker value={jobId} onChange={setJobId} />}
          {error && <div style={{ color: "var(--rust)", fontSize: 12.5, marginTop: 8 }}>{error}</div>}
        </div>

        {rows.length > 0 && (
          <div className="card2">
            <div className="card-title">
              Legal moves, best first {value !== null && `· ${source === "dp" ? "v*(s)" : "max Q"} = ${value.toFixed(3)}`}
            </div>
            <div style={{ maxHeight: 300, overflowY: "auto" }}>
              {rows.map((r, i) => (
                <div className="stat-row" key={i} style={{ cursor: setupMode ? "default" : "pointer" }}
                  onClick={() => !setupMode && !busy && playMove(r.piece, r.dest)}
                  title={setupMode ? "" : "Click to play this move"}>
                  <span className="label">
                    {r.piece === "K" ? "♔" : "♕"} → {r.dest_name}
                    {r.optimal ? "  ★" : ""}
                    {KIND_LABEL[r.kind] && (
                      <span className={`badge ${r.kind === "checkmate" ? "success" : "fail"}`} style={{ marginLeft: 6 }}>{KIND_LABEL[r.kind]}</span>
                    )}
                    {r.visits !== undefined && (
                      <span style={{ marginLeft: 6, fontSize: 11 }}>{r.visits === 0 ? "never tried" : `${r.visits} visits`}</span>
                    )}
                  </span>
                  <span className="value" style={{ color: qColor(r.q) }}>{r.q.toFixed(3)}</span>
                </div>
              ))}
            </div>
            <div className="key-rule" style={{ marginTop: 10 }}>
              {source === "dp" ? (
                <>★ marks every optimal move (ties are common). Exact values, from one Bellman backup on V*<sub>h−1</sub>.
                  Click a row to play that move.</>
              ) : (
                <>Learned estimates, not exact values. Stored once per symmetry class
                  {canonical && <> (this board ≡ representative K{canonical.wk} Q{canonical.wq} vs K{canonical.bk})</>},
                  and independent of the moves left. {nUnseen > 0 && <>{nUnseen} move(s) were never tried and still
                  show the starting value Q0 — that is why an under-trained agent likes untried moves.</>}</>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

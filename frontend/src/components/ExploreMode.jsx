import { useEffect, useState } from "react";
import ChessBoard from "./ChessBoard.jsx";
import JobPicker from "./JobPicker.jsx";
import { api } from "../api.js";

const FILES = "abcdefgh";

function sqFromName(name) {
  const f = FILES.indexOf(name[0]);
  const r = parseInt(name.slice(1), 10) - 1;
  if (f < 0 || !(r >= 0 && r < 8)) throw new Error(`"${name}" is not a square`);
  return r * 8 + f;
}

const sqName = (sq) => `${FILES[sq % 8]}${Math.floor(sq / 8) + 1}`;

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
  const [placing, setPlacing] = useState("wk");
  const [movesLeft, setMovesLeft] = useState(40);
  const [source, setSource] = useState("dp");
  const [jobId, setJobId] = useState("");
  const [dpStatus, setDpStatus] = useState(null);
  const [rows, setRows] = useState([]);
  const [value, setValue] = useState(null);
  const [canonical, setCanonical] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

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

  async function query() {
    setError(null);
    setBusy(true);
    try {
      const wk = sqFromName(wkName), wq = sqFromName(wqName), bk = sqFromName(bkName);
      if (source === "dp") {
        const res = await api.dpQuery(wk, wq, bk, movesLeft);
        setValue(res.value);
        setRows(res.qvalues);
        setCanonical(null);
      } else {
        if (!jobId) throw new Error("No training job yet — start one in Live Training.");
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
  }

  let wk = null, wq = null, bk = null;
  try {
    wk = sqFromName(wkName);
    wq = sqFromName(wqName);
    bk = sqFromName(bkName);
  } catch {
    wk = null;
  }

  function handleSquareClick(sq) {
    const setters = { wk: setWkName, wq: setWqName, bk: setBkName };
    setters[placing](sqName(sq));
    setRows([]);
    setValue(null);
  }

  // One tag per destination square: the best q among moves landing there.
  const labels = {};
  for (const r of rows) {
    if (!labels[r.dest] || labels[r.dest].q < r.q) {
      labels[r.dest] = { q: r.q, text: r.q.toFixed(2), color: qColor(r.q) };
    }
  }

  const nUnseen = rows.filter((r) => r.visits === 0).length;

  return (
    <div className="panel-grid">
      <div className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        {wk !== null && (
          <ChessBoard wk={wk} wq={wq} bk={bk} squareLabels={labels} onSquareClick={handleSquareClick} />
        )}
        <div className="field-row" style={{ width: "100%" }}>
          <span>Click a square to place:</span>
          <span style={{ display: "flex", gap: 10 }}>
            <label><input type="radio" checked={placing === "wk"} onChange={() => setPlacing("wk")} /> ♔ White king</label>
            <label><input type="radio" checked={placing === "wq"} onChange={() => setPlacing("wq")} /> ♕ Queen</label>
            <label><input type="radio" checked={placing === "bk"} onChange={() => setPlacing("bk")} /> ♚ Black king</label>
          </span>
        </div>
        <div className="key-rule" style={{ width: "100%" }}>
          <strong>What this shows.</strong> Each coloured tag is a legal White destination, labelled with
          the value of playing that move — <em>q(s, a)</em>, the expected discounted return if White plays it
          and then keeps playing well. Close to +1 = fast forced mate; negative = the move risks stalemate,
          losing the queen, or running out of moves. The agent's policy is simply "play the highest tag".
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="card2">
          <div className="card-title">Position</div>
          <div className="field-row"><span>White king</span><input type="text" value={wkName} onChange={(e) => setWkName(e.target.value)} style={{ width: 60 }} /></div>
          <div className="field-row"><span>White queen</span><input type="text" value={wqName} onChange={(e) => setWqName(e.target.value)} style={{ width: 60 }} /></div>
          <div className="field-row"><span>Black king</span><input type="text" value={bkName} onChange={(e) => setBkName(e.target.value)} style={{ width: 60 }} /></div>
          <div className="field-row">
            <span>Moves left (h){source === "mc" && " — ignored by MC"}</span>
            <input type="number" min={1} max={40} value={movesLeft} onChange={(e) => setMovesLeft(+e.target.value)} style={{ width: 60 }} disabled={source === "mc"} />
          </div>
        </div>

        <div className="card2">
          <div className="card-title">Source</div>
          <div className="field-row">
            <label><input type="radio" checked={source === "dp"} onChange={() => setSource("dp")} /> Exact q* (DP)</label>
            <label><input type="radio" checked={source === "mc"} onChange={() => setSource("mc")} /> Learned Q (Monte Carlo)</label>
          </div>
          {source === "dp" && dpStatus && dpStatus.status !== "ready" && (
            <>
              <div style={{ fontSize: 12, color: "var(--rust)", marginBottom: 8 }}>
                DP status: {dpStatus.status}{dpStatus.progress?.stage ? ` (${dpStatus.progress.stage})` : ""}
              </div>
              <button className="secondary" style={{ width: "100%" }} onClick={solveDp} disabled={busy}>Solve DP (one-time, ~3 min cold)</button>
            </>
          )}
          {source === "mc" && <JobPicker value={jobId} onChange={setJobId} />}
          <button className="primary" style={{ width: "100%", marginTop: 8 }} onClick={query} disabled={busy || wk === null}>Inspect position</button>
          {error && <div style={{ color: "var(--rust)", fontSize: 12.5, marginTop: 8 }}>{error}</div>}
        </div>

        {rows.length > 0 && (
          <div className="card2">
            <div className="card-title">
              Candidate moves {value !== null && `· ${source === "dp" ? "v*(s)" : "max Q"} = ${value.toFixed(3)}`}
            </div>
            <div style={{ maxHeight: 300, overflowY: "auto" }}>
              {rows.map((r, i) => (
                <div className="stat-row" key={i}>
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
                <>★ marks every optimal move (ties are common: several moves can lead to the same forced mate).
                  These are exact values, recomputed with one Bellman backup from V*<sub>h−1</sub>.</>
              ) : (
                <>Learned estimates, not exact values. Stored once per symmetry class
                  {canonical && <> (this board ≡ representative K{canonical.wk} Q{canonical.wq} vs K{canonical.bk})</>},
                  and independent of the moves left. {nUnseen > 0 && <>{nUnseen} move(s) were never tried and still
                  show the optimistic Q0 — that is why an under-trained agent likes untried moves.</>}</>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

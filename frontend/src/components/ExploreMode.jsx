import { useEffect, useState } from "react";
import ChessBoard from "./ChessBoard.jsx";
import { api } from "../api.js";

function sqFromName(name) {
  const f = name.charCodeAt(0) - "a".charCodeAt(0);
  const r = parseInt(name[1], 10) - 1;
  return r * 8 + f;
}

export default function ExploreMode() {
  const [wkName, setWkName] = useState("a1");
  const [wqName, setWqName] = useState("a7");
  const [bkName, setBkName] = useState("a8");
  const [movesLeft, setMovesLeft] = useState(40);
  const [source, setSource] = useState("dp");
  const [jobId, setJobId] = useState("");
  const [dpStatus, setDpStatus] = useState(null);
  const [rows, setRows] = useState([]);
  const [value, setValue] = useState(null);
  const [bestMove, setBestMove] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    refreshDpStatus();
  }, []);

  async function refreshDpStatus() {
    try {
      const s = await api.dpStatus();
      setDpStatus(s);
    } catch (e) {
      setError(e.message);
    }
  }

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
        if (res.error) throw new Error(res.error);
        setValue(res.value);
        setBestMove(res.best_move);
        const lm = await api.legalMoves(wk, wq, bk);
        setRows(
          lm.legal_moves
            .map((m) => ({ ...m, isBest: res.best_move && res.best_move.piece === m.piece && res.best_move.dest === m.dest }))
        );
      } else {
        if (!jobId) throw new Error("Enter a training job id first (from Live Training).");
        const res = await api.trainQtable(jobId, wk, wq, bk);
        setRows(res.qvalues.map((r) => ({ ...r, q: r.q })));
        setValue(res.qvalues.length ? res.qvalues[0].q : null);
        setBestMove(res.qvalues.length ? res.qvalues[0] : null);
      }
    } catch (e) {
      setError(e.message);
      setRows([]);
      setValue(null);
      setBestMove(null);
    } finally {
      setBusy(false);
    }
  }

  let wk, wq, bk;
  try {
    wk = sqFromName(wkName);
    wq = sqFromName(wqName);
    bk = sqFromName(bkName);
  } catch {
    wk = wq = bk = null;
  }

  return (
    <div className="panel-grid">
      <div className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        {wk !== null && (
          <ChessBoard
            wk={wk}
            wq={wq}
            bk={bk}
            legalDests={rows}
          />
        )}
        <div className="key-rule" style={{ width: "100%" }}>
          Pick any legal position below, then inspect what the agent values each candidate move at.
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="card2">
          <div className="card-title">Position</div>
          <div className="field-row"><span>White king</span><input type="text" value={wkName} onChange={(e) => setWkName(e.target.value)} style={{ width: 60 }} /></div>
          <div className="field-row"><span>White queen</span><input type="text" value={wqName} onChange={(e) => setWqName(e.target.value)} style={{ width: 60 }} /></div>
          <div className="field-row"><span>Black king</span><input type="text" value={bkName} onChange={(e) => setBkName(e.target.value)} style={{ width: 60 }} /></div>
          <div className="field-row"><span>Moves left</span><input type="number" value={movesLeft} onChange={(e) => setMovesLeft(+e.target.value)} style={{ width: 60 }} /></div>
        </div>

        <div className="card2">
          <div className="card-title">Source</div>
          <div className="field-row">
            <label><input type="radio" checked={source === "dp"} onChange={() => setSource("dp")} /> Exact DP (π*)</label>
            <label><input type="radio" checked={source === "mc"} onChange={() => setSource("mc")} /> MC training job</label>
          </div>
          {source === "dp" && dpStatus && dpStatus.status !== "ready" && (
            <>
              <div style={{ fontSize: 12, color: "var(--rust)", marginBottom: 8 }}>
                DP status: {dpStatus.status}{dpStatus.progress?.stage ? ` (${dpStatus.progress.stage})` : ""}
              </div>
              <button className="secondary" style={{ width: "100%" }} onClick={solveDp} disabled={busy}>Solve DP (one-time, ~3 min cold)</button>
            </>
          )}
          {source === "mc" && (
            <div className="field-row"><span>Job id</span><input type="text" value={jobId} onChange={(e) => setJobId(e.target.value)} style={{ width: 120 }} /></div>
          )}
          <button className="primary" style={{ width: "100%", marginTop: 8 }} onClick={query} disabled={busy}>Inspect position</button>
          {error && <div style={{ color: "var(--rust)", fontSize: 12.5, marginTop: 8 }}>{error}</div>}
        </div>

        {rows.length > 0 && (
          <div className="card2">
            <div className="card-title">Candidate moves {value !== null && `· value ${value.toFixed(3)}`}</div>
            {rows.map((r, i) => (
              <div className="stat-row" key={i}>
                <span className="label">{r.piece} → {r.dest_name}{bestMove && bestMove.piece === r.piece && bestMove.dest === r.dest ? "  ★" : ""}</span>
                <span className="value">{r.q !== undefined ? r.q.toFixed(3) : ""}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState, useCallback } from "react";
import ChessBoard from "./ChessBoard.jsx";
import JobPicker from "./JobPicker.jsx";
import { api } from "../api.js";

export default function PlayMode() {
  const [budget, setBudget] = useState(40);
  const [seed, setSeed] = useState("");
  const [position, setPosition] = useState(null); // {wk,wq,bk,moves_left,wk_name,wq_name,bk_name}
  const [legalMoves, setLegalMoves] = useState([]);
  const [selectedPiece, setSelectedPiece] = useState(null);
  const [lastMove, setLastMove] = useState(null);
  const [log, setLog] = useState([]);
  const [outcome, setOutcome] = useState(null); // null while ongoing
  const [controller, setController] = useState("human"); // human | agent
  const [source, setSource] = useState("dp"); // dp | mc
  const [jobId, setJobId] = useState("");
  const [dpReady, setDpReady] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [finalBoard, setFinalBoard] = useState(null);
  const [startBudget, setStartBudget] = useState(null);
  const [ret, setRet] = useState(0); // discounted return G_0 accumulated so far

  useEffect(() => {
    api.dpStatus().then((s) => setDpReady(s.status === "ready")).catch(() => {});
    startNewGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startNewGame = useCallback(async (b = budget, s = seed) => {
    setError(null);
    setBusy(true);
    try {
      const res = await api.newGame(b, s === "" ? undefined : s);
      setPosition(res.position);
      setLegalMoves(res.legal_moves);
      setSelectedPiece(null);
      setLastMove(null);
      setOutcome(null);
      setFinalBoard(null);
      setStartBudget(res.position.moves_left);
      setRet(0);
      setLog([`New game — White to move (budget ${res.position.moves_left}).`]);
      setSuggestion(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, [budget, seed]);

  const destsForSelected = selectedPiece
    ? legalMoves.filter((m) => m.piece === selectedPiece)
    : [];

  async function handleSquareClick(sq) {
    if (!position || outcome || busy || controller !== "human") return;
    if (sq === position.wk && legalMoves.some((m) => m.piece === "K")) {
      setSelectedPiece("K");
      return;
    }
    if (sq === position.wq && legalMoves.some((m) => m.piece === "Q")) {
      setSelectedPiece("Q");
      return;
    }
    if (selectedPiece) {
      const mv = destsForSelected.find((m) => m.dest === sq);
      if (mv) {
        await playMove(selectedPiece, sq);
      }
    }
  }

  async function playMove(piece, dest) {
    setBusy(true);
    setError(null);
    try {
      const from = piece === "K" ? position.wk : position.wq;
      const destName = (legalMoves.find((m) => m.piece === piece && m.dest === dest) || {}).dest_name ?? dest;
      const res = await api.step(position, piece, dest, undefined);
      setLastMove({ from, to: dest });
      setLog((l) => [...l, `White ${piece} → ${destName}.`]);
      setSelectedPiece(null);
      setSuggestion(null);

      const t = (startBudget ?? position.moves_left) - position.moves_left;
      setRet((g) => g + Math.pow(0.99, t) * res.reward);
      if (res.done) {
        setOutcome(res.outcome);
        setLog((l) => [...l, `Game over: ${res.outcome} (reward ${res.reward}).`]);
        // Keep the final board on screen (Black does not move after a terminal White move).
        const wk = piece === "K" ? dest : position.wk;
        const wq = piece === "Q" ? dest : position.wq;
        if (res.outcome === "queen_captured") {
          setFinalBoard({ wk, wq: -1, bk: wq }); // Black king now stands on the queen's square
        } else {
          setFinalBoard({ wk, wq, bk: position.bk });
        }
        setPosition(null);
        setLegalMoves([]);
      } else {
        setPosition(res.position);
        setLegalMoves(res.legal_moves);
        if (res.black_reply) {
          setLog((l) => [...l, `Black king → ${res.black_reply}.`]);
        }
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function requestAgentMove(play) {
    if (!position) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.agentMove(
        position.wk,
        position.wq,
        position.bk,
        position.moves_left,
        source,
        source === "mc" ? jobId : undefined
      );
      setSuggestion(res);
      if (play) {
        await playMove(res.piece, res.dest);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // auto-play when the agent controls White
  useEffect(() => {
    if (controller === "agent" && position && !outcome && !busy) {
      const t = setTimeout(() => requestAgentMove(true), 400);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller, position, outcome, busy]);

  return (
    <div className="panel-grid">
      <div className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        {position ? (
          <ChessBoard
            wk={position.wk}
            wq={position.wq}
            bk={position.bk}
            legalDests={destsForSelected}
            selectedPiece={selectedPiece}
            onSquareClick={handleSquareClick}
            lastMove={lastMove}
          />
        ) : finalBoard ? (
          <ChessBoard wk={finalBoard.wk} wq={finalBoard.wq} bk={finalBoard.bk} lastMove={lastMove} />
        ) : (
          <div style={{ padding: 60, color: "var(--muted)" }}>Loading…</div>
        )}
        {position && (
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            Moves left: <strong style={{ color: "var(--navy)" }}>{position.moves_left}</strong> · White to move
            · return so far G = <strong style={{ color: "var(--navy)" }}>{ret.toFixed(4)}</strong>
          </div>
        )}
        {outcome && (
          <div className={`badge ${outcome === "checkmate" ? "success" : "fail"}`} style={{ fontSize: 14 }}>
            {outcome === "checkmate" ? "Checkmate — success" : `Failure — ${outcome.replace("_", " ")}`} · final return G = {ret.toFixed(4)}
          </div>
        )}
        {error && <div style={{ color: "var(--rust)", fontSize: 13 }}>{error}</div>}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="card2">
          <div className="card-title">New game</div>
          <div className="field-row">
            <span>Budget (max moves)</span>
            <input type="number" value={budget} min={1} max={100} onChange={(e) => setBudget(+e.target.value)} />
          </div>
          <div className="field-row">
            <span>Seed (optional)</span>
            <input type="number" value={seed} onChange={(e) => setSeed(e.target.value)} />
          </div>
          <button className="primary" style={{ width: "100%" }} onClick={() => startNewGame()} disabled={busy}>
            Start new game
          </button>
        </div>

        <div className="card2">
          <div className="card-title">White is controlled by</div>
          <div className="field-row">
            <label><input type="radio" checked={controller === "human"} onChange={() => setController("human")} /> You</label>
            <label><input type="radio" checked={controller === "agent"} onChange={() => setController("agent")} /> Agent</label>
          </div>
          <div className="field-row">
            <span>Agent source</span>
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="dp">Optimal (DP)</option>
              <option value="mc">Trained (Monte Carlo)</option>
            </select>
          </div>
          {source === "dp" && !dpReady && (
            <div style={{ fontSize: 12, color: "var(--rust)" }}>DP solution not cached yet — see Results Dashboard / Explore tab to solve it.</div>
          )}
          {source === "mc" && <JobPicker value={jobId} onChange={setJobId} />}
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
            {source === "dp"
              ? "Optimal (DP): reads the move from π*, computed exactly by backward induction over all 144,508 boards and every remaining budget h. It cannot be beaten on average."
              : "Trained (MC): reads the greedy move from a Q-table learned only by playing games (no model). Its quality depends on how many episodes the job has run — a few thousand episodes is still close to random."}
          </div>
          {controller === "human" && (
            <button className="secondary" style={{ width: "100%", marginTop: 6 }} onClick={() => requestAgentMove(false)} disabled={busy || !position}>
              Suggest a move
            </button>
          )}
          {suggestion && (
            <div className="key-rule" style={{ marginTop: 10 }}>
              Suggested: {suggestion.piece} → {suggestion.dest_name} (value {suggestion.value?.toFixed(3)})
            </div>
          )}
        </div>

        <div className="card2">
          <div className="card-title">Move log</div>
          <div className="log-list">
            {log.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

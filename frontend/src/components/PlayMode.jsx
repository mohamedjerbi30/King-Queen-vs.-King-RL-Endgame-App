import { useCallback, useEffect, useRef, useState } from "react";
import ChessBoard from "./ChessBoard.jsx";
import ResultBanner from "./ResultBanner.jsx";
import JobPicker, { useJobs, useSelectedJob } from "./JobPicker.jsx";
import { api } from "../api.js";
import { usePersistentState } from "../lib/storage.js";
import { gameRecord, moveLabel, sqName, valueMeaning, valueTag } from "../lib/chess.js";
import { recordGame } from "../lib/history.js";
import { Badge, Button, Callout, Card, ErrorText, Field, NumberInput, Segmented, Select } from "../ui/index.jsx";

const EMPTY_GAME = {
  position: null, legalMoves: [], moves: [], outcome: null, finalBoard: null,
  ret: 0, startBudget: 40, lastMove: null, blackMove: null,
  humanMoved: false, agentSources: [], // who played this game (for the Results page)
};

const OUTCOME_TEXT = {
  checkmate: "Checkmate — White wins",
  stalemate: "Stalemate — draw (counts as failure)",
  queen_captured: "Queen captured — failure",
  budget_exhausted: "Move budget used up — failure",
};

export default function PlayMode({ active }) {
  const [budget, setBudget] = usePersistentState("play.budget", 40);
  const [seed, setSeed] = usePersistentState("play.seed", "");
  const [source, setSource] = usePersistentState("play.source", "dp");
  const [speed, setSpeed] = usePersistentState("play.speed", "600");
  const [game, setGame] = usePersistentState("play.game", EMPTY_GAME);
  const [jobId] = useSelectedJob();
  const { jobs } = useJobs();

  const [running, setRunning] = useState(false); // agent auto-play (never persisted)
  const [selected, setSelected] = useState(null); // 'K' | 'Q'
  const [suggestion, setSuggestion] = useState(null);
  const [dpReady, setDpReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const busyRef = useRef(false);
  const [bannerHidden, setBannerHidden] = useState(false);
  useEffect(() => setBannerHidden(false), [game.outcome]); // show it again for each finished game

  const pos = game.position;
  const mcAvailable = jobs.some((j) => j.job_id === jobId);
  const agentAvailable = source === "dp" ? dpReady : mcAvailable;
  const agentProblem = source === "dp"
    ? (dpReady ? null : "The exact DP solution is not loaded on this server yet (Explore → Solve DP).")
    : (mcAvailable ? null : "No trained Monte Carlo agent yet — start a run in Live Training first.");

  useEffect(() => {
    api.dpStatus().then((s) => setDpReady(s.status === "ready")).catch(() => setDpReady(false));
  }, []);

  const startNewGame = useCallback(async () => {
    setError(null);
    setRunning(false);
    setSelected(null);
    setSuggestion(null);
    try {
      const res = await api.newGame(budget || 40, seed === "" ? undefined : seed);
      setGame({ ...EMPTY_GAME, position: res.position, legalMoves: res.legal_moves, startBudget: res.position.moves_left });
    } catch (e) {
      setError(e.message);
    }
  }, [budget, seed, setGame]);

  // First visit (nothing stored yet): deal a game.
  useEffect(() => {
    if (!game.position && !game.finalBoard) startNewGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const playMove = useCallback(async (piece, dest, byAgent = false) => {
    if (!pos || busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await api.step(pos, piece, dest, undefined);
      const t = game.startBudget - pos.moves_left; // White moves already played
      const ret = game.ret + Math.pow(0.99, t) * res.reward;
      const from = piece === "K" ? pos.wk : pos.wq;
      const wk = piece === "K" ? dest : pos.wk;
      const wq = piece === "Q" ? dest : pos.wq;
      const entry = { white: moveLabel(piece, dest) };
      const humanMoved = game.humanMoved || !byAgent;
      const prevSources = game.agentSources || [];
      const agentSources = byAgent && !prevSources.includes(source) ? [...prevSources, source] : prevSources;
      if (res.done) {
        entry.result = res.outcome === "checkmate" ? "#" : `(${res.outcome.replace("_", " ")})`;
        if (res.outcome === "queen_captured") entry.black = `Kx${sqName(wq)}`;
        const finalBoard = res.outcome === "queen_captured" ? { wk, wq: -1, bk: wq } : { wk, wq, bk: pos.bk };
        recordGame({ who: humanMoved ? "you" : agentSources.length === 1 ? agentSources[0] : "mixed", outcome: res.outcome, moves: game.moves.length + 1, ret });
        setGame({ ...game, humanMoved, agentSources, position: null, legalMoves: [], moves: [...game.moves, entry], outcome: res.outcome,
          finalBoard, ret, lastMove: { from, to: dest }, blackMove: res.outcome === "queen_captured" ? { from: pos.bk, to: wq } : null });
        setRunning(false);
      } else {
        entry.black = `K${res.black_reply}`;
        setGame({ ...game, humanMoved, agentSources, position: res.position, legalMoves: res.legal_moves, moves: [...game.moves, entry], ret,
          lastMove: { from, to: dest }, blackMove: { from: pos.bk, to: res.position.bk } });
      }
      setSelected(null);
      setSuggestion(null);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [pos, game, setGame, source]);

  const askAgent = useCallback(async () => {
    if (!pos) return null;
    const res = await api.agentMove(pos.wk, pos.wq, pos.bk, pos.moves_left, source, source === "mc" ? jobId : undefined);
    setSuggestion(res);
    return res;
  }, [pos, source, jobId]);

  const agentStep = useCallback(async () => {
    try {
      const mv = await askAgent();
      if (!mv || !(await playMove(mv.piece, mv.dest, true))) setRunning(false);
    } catch (e) {
      setError(e.message);
      setRunning(false); // never retry in a loop on errors
    }
  }, [askAgent, playMove]);

  // Auto-play while running (only on the visible page).
  useEffect(() => {
    if (!running || !active || !pos || busy) return;
    if (!agentAvailable) {
      setRunning(false);
      return;
    }
    const t = setTimeout(agentStep, Number(speed));
    return () => clearTimeout(t);
  }, [running, active, pos, busy, agentAvailable, agentStep, speed]);

  function handleSquareClick(sq) {
    if (!pos || busy || running) return;
    if (sq === pos.wk) return setSelected("K");
    if (sq === pos.wq) return setSelected("Q");
    if (selected && game.legalMoves.some((m) => m.piece === selected && m.dest === sq)) playMove(selected, sq);
    else setSelected(null);
  }

  const dests = selected ? game.legalMoves.filter((m) => m.piece === selected) : [];
  const board = pos || game.finalBoard;
  const record = gameRecord(game.moves);

  return (
    <div className="page-grid">
      <Card tour="play-board" className="board-card">
        {board ? (
          <ChessBoard
            wk={board.wk} wq={board.wq} bk={board.bk}
            legalDests={dests}
            selected={selected ? (selected === "K" ? pos?.wk : pos?.wq) : null}
            onSquareClick={handleSquareClick}
            lastMove={game.lastMove}
            blackMove={game.blackMove}
          />
        ) : (
          <div className="empty">Loading…</div>
        )}
        <div className="board-status" data-tour="play-status">
          {pos ? (
            <>
              <Badge tone="neutral">White to move</Badge>
              <span>Moves left <strong>{pos.moves_left}</strong></span>
              <span>Return so far <strong>G = {game.ret.toFixed(4)}</strong></span>
            </>
          ) : game.outcome ? (
            <>
              <Badge tone={game.outcome === "checkmate" ? "success" : "fail"}>{OUTCOME_TEXT[game.outcome]}</Badge>
              <span>Final return <strong>G = {game.ret.toFixed(4)}</strong></span>
            </>
          ) : null}
        </div>
        <div className="legend">
          <span><i className="swatch" style={{ background: "rgba(204,138,44,0.55)" }} /> White's last move</span>
          <span><i className="swatch" style={{ background: "rgba(22,42,75,0.30)" }} /> Black's reply</span>
          <span><i className="swatch dot" /> legal destination</span>
        </div>
        <ErrorText>{error}</ErrorText>
        {game.outcome && !bannerHidden && (
          <ResultBanner
            outcome={game.outcome}
            who={game.humanMoved ? "You" : (game.agentSources || []).length === 1
              ? (game.agentSources[0] === "dp" ? "The optimal agent" : "The trained agent") : "The agents"}
            moves={game.moves.length}
            ret={game.ret}
            actions={[{ label: "New game", onClick: startNewGame }]}
            onDismiss={() => setBannerHidden(true)}
          />
        )}
      </Card>

      <div className="side">
        <Card title="New game" tone="soft" tour="play-newgame">
          <Field label="Move budget" info="How many White moves are allowed before the game counts as a failure (the project uses 40).">
            <NumberInput value={budget} min={1} max={40} onChange={setBudget} />
          </Field>
          <Field label="Seed (optional)" info="Same seed = same starting position, so you can replay a game.">
            <NumberInput value={seed} onChange={setSeed} placeholder="random" />
          </Field>
          <Button block onClick={startNewGame} disabled={busy}>Start new game</Button>
        </Card>

        <Card title="The agent (White)" tone="soft" tour="play-agent">
          <Field label="Agent" tour="play-source"
            info="Optimal (DP) reads the exact best move computed from the rules. Trained (MC) reads the move a Monte Carlo agent learned by playing.">
            <Segmented
              value={source}
              onChange={(v) => { setSource(v); setRunning(false); setSuggestion(null); }}
              options={[{ value: "dp", label: "Optimal (DP)" }, { value: "mc", label: "Trained (MC)" }]}
            />
          </Field>
          {source === "mc" && <JobPicker />}
          {agentProblem && <Callout tone="warn">{agentProblem}</Callout>}

          <div className="button-row" data-tour="play-controls">
            <Button
              variant={running ? "secondary" : "primary"}
              onClick={() => setRunning((r) => !r)}
              disabled={!agentAvailable || !pos}
            >
              {running ? "⏸ Pause" : "▶ Let the agent play"}
            </Button>
            <Button variant="secondary" onClick={agentStep} disabled={!agentAvailable || !pos || running || busy}>
              Next agent move
            </Button>
            <Button variant="secondary" onClick={() => askAgent().catch((e) => setError(e.message))} disabled={!agentAvailable || !pos || running || busy}>
              Hint
            </Button>
          </div>
          <Field label="Speed" tour="play-speed">
            <Select value={speed} onChange={setSpeed}
              options={[{ value: "1200", label: "Slow" }, { value: "600", label: "Normal" }, { value: "150", label: "Fast" }]} />
          </Field>

          {suggestion && (
            <Callout tone="info" tour="play-hint">
              Agent's choice: <strong>{moveLabel(suggestion.piece, suggestion.dest_name)}</strong> — {source === "dp"
                ? <>value {suggestion.value.toFixed(3)} = <strong>{valueMeaning(suggestion.value)}</strong> ({valueTag(suggestion.value)}).</>
                : <>learned value {suggestion.value.toFixed(3)} (an estimate: ≈ {valueTag(suggestion.value)}).</>}
            </Callout>
          )}
        </Card>

        <Card title="Game record" tone="soft" tour="play-log">
          {record.length === 0 ? (
            <div className="muted">No moves yet. Click your king or queen, then a highlighted square.</div>
          ) : (
            <ol className="record">
              {record.map((line, i) => <li key={i}>{line}</li>)}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}

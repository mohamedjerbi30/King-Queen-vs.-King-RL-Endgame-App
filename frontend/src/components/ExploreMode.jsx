import { useCallback, useEffect, useMemo, useState } from "react";
import ChessBoard from "./ChessBoard.jsx";
import ResultBanner from "./ResultBanner.jsx";
import JobPicker, { useJobs, useSelectedJob } from "./JobPicker.jsx";
import { agentQValues } from "../lib/agents.js";
import { useServerInfo } from "../lib/server.js";
import { api } from "../api.js";
import { usePersistentState } from "../lib/storage.js";
import { GRADE, grade, moveLabel, positionError, sqFromName, sqName, valueMeaning, valueTag } from "../lib/chess.js";
import { Badge, Button, Callout, Card, ErrorText, Field, NumberInput, Segmented, Select, TextInput } from "../ui/index.jsx";

const EXAMPLES = [
  { value: "", label: "Load an example position…" },
  { value: "c6,e4,a8", label: "Mate in 2 — six equally good moves (Kc6 Qe4 vs Ka8)" },
  { value: "e1,d1,e8", label: "Trap — two queen moves lose the queen (Ke1 Qd1 vs Ke8)" },
  { value: "d4,b2,g8", label: "The presentation's example (Kd4 Qb2 vs Kg8)" },
  { value: "f6,a7,h8", label: "Mate in 1 next to a stalemate trap (Kf6 Qa7 vs Kh8)" },
];

const glyph = (piece) => (piece === "K" ? "♔" : "♕");

/** Plain-language summary of a list of graded moves. */
function summarise(rows, source) {
  if (!rows.length) return null;
  const count = (g) => rows.filter((r) => r.grade === g).length;
  const best = rows[0];
  const parts = [];
  const nBest = count("best");
  if (source === "mc") {
    parts.push(`The agent would play ${moveLabel(best.piece, best.dest_name)} (learned value ${best.q.toFixed(2)}).`);
    const unknown = count("unknown");
    if (unknown) parts.push(`${unknown} of ${rows.length} moves were never tried during training, so the agent knows nothing about them.`);
    return parts.join(" ");
  }
  parts.push(`${nBest} move${nBest > 1 ? "s" : ""} ${nBest > 1 ? "are" : "is"} best: ${valueMeaning(best.q)}.`);
  const close = count("close"), slower = count("slower") + count("poor"), bad = count("blunder");
  if (close) parts.push(`${close} ${close > 1 ? "are" : "is"} about one move slower.`);
  if (slower) parts.push(`${slower} ${slower > 1 ? "are" : "is"} clearly slower.`);
  parts.push(bad ? `${bad} ${bad > 1 ? "are blunders" : "is a blunder"} (red).` : "No move here is a blunder.");
  return parts.join(" ");
}

export default function ExploreMode() {
  const server = useServerInfo();
  const [wkName, setWkName] = usePersistentState("explore.wk", "c6");
  const [wqName, setWqName] = usePersistentState("explore.wq", "e4");
  const [bkName, setBkName] = usePersistentState("explore.bk", "a8");
  const [h, setH] = usePersistentState("explore.h", 40);
  const [source, setSource] = usePersistentState("explore.source", "dp");
  const [mode, setMode] = usePersistentState("explore.mode", "move");
  const [placing, setPlacing] = usePersistentState("explore.placing", "wk");
  const [history, setHistory] = usePersistentState("explore.history", []);
  const [jobId] = useSelectedJob();
  const { options: agentOptions } = useJobs();

  const [selected, setSelected] = useState(null);
  const [lastMove, setLastMove] = useState(null);
  const [blackMove, setBlackMove] = useState(null);
  const [dpStatus, setDpStatus] = useState(null);
  const [dpRows, setDpRows] = useState([]);
  const [mcRows, setMcRows] = useState([]);
  const [canonical, setCanonical] = useState(null);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [ended, setEnded] = useState(null); // {outcome, moves} when a played move ends the game

  const wk = sqFromName(wkName), wq = sqFromName(wqName), bk = sqFromName(bkName);
  const posError = positionError(wk, wq, bk);
  const dpReady = dpStatus?.status === "ready";
  const mcAvailable = agentOptions.some((o) => o.value === jobId && o.ready);
  const needDp = source !== "mc", needMc = source !== "dp";

  // (Re)check once the server answers — a sleeping free server may wake up later.
  useEffect(() => {
    api.dpStatus().then(setDpStatus).catch(() => setDpStatus({ status: "unreachable" }));
  }, [server?.reachable]);

  const load = useCallback(async () => {
    setError(null);
    if (posError) return;
    setBusy(true);
    try {
      if (needDp && dpReady) {
        const res = await api.dpQuery(wk, wq, bk, h || 40);
        setDpRows(res.qvalues);
      } else setDpRows([]);
      if (needMc && mcAvailable) {
        const res = await agentQValues(jobId, wk, wq, bk);
        setMcRows(res.qvalues);
        setCanonical(res.canonical);
      } else setMcRows([]);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, [posError, needDp, needMc, dpReady, mcAvailable, wk, wq, bk, h, jobId]);

  useEffect(() => {
    load();
  }, [load]);

  // Rows for the active source, graded against the best move of the position.
  const rows = useMemo(() => {
    if (posError) return [];
    if (source === "mc") {
      const best = mcRows.length ? mcRows[0].q : 0;
      return mcRows.map((r) => ({ ...r, grade: r.visits === 0 ? "unknown" : Math.abs(r.q - best) < 1e-12 ? "best" : grade(r.q, best) }));
    }
    const best = dpRows.length ? dpRows[0].q : 0;
    const mcByMove = Object.fromEntries(mcRows.map((r) => [`${r.piece}${r.dest}`, r]));
    return dpRows.map((r) => ({ ...r, grade: grade(r.q, best), mc: mcByMove[`${r.piece}${r.dest}`] }));
  }, [source, dpRows, mcRows, posError]);

  const mcChoice = source === "compare" && mcRows.length ? mcRows[0] : null;
  const mcChoiceRow = mcChoice ? rows.find((r) => r.piece === mcChoice.piece && r.dest === mcChoice.dest) : null;

  function setPosition(w, q, b) {
    setWkName(sqName(w));
    setWqName(sqName(q));
    setBkName(sqName(b));
  }

  function loadExample(v) {
    if (!v) return;
    const [a, b, c] = v.split(",");
    setWkName(a);
    setWqName(b);
    setBkName(c);
    setH(40);
    setHistory([]);
    setEnded(null);
    setLastMove(null);
    setBlackMove(null);
    setMessage(null);
    setSelected(null);
  }

  async function playMove(piece, dest) {
    if (busy || posError) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.step({ wk, wq, bk, moves_left: h || 40 }, piece, dest);
      setHistory([...history, { wk: wkName, wq: wqName, bk: bkName, h }]);
      setLastMove({ from: piece === "K" ? wk : wq, to: dest });
      if (res.done) {
        setEnded({ outcome: res.outcome, moves: history.length + 1 });
        setMessage(`${moveLabel(piece, dest)} ended the game: ${res.outcome.replace("_", " ")} (reward ${res.reward}). Use Undo or load another position.`);
        if (piece === "K") setWkName(sqName(dest));
        else setWqName(sqName(dest));
        setBlackMove(null);
      } else {
        setMessage(`You played ${moveLabel(piece, dest)}; Black answered K${res.black_reply}. The values now describe the new position.`);
        setBlackMove({ from: bk, to: res.position.bk });
        setPosition(res.position.wk, res.position.wq, res.position.bk);
        setH(res.position.moves_left);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      setSelected(null);
    }
  }

  function undo() {
    const prev = history[history.length - 1];
    if (!prev) return;
    setEnded(null);
    setHistory(history.slice(0, -1));
    setWkName(prev.wk);
    setWqName(prev.wq);
    setBkName(prev.bk);
    setH(prev.h);
    setLastMove(null);
    setBlackMove(null);
    setMessage(null);
  }

  function handleSquareClick(sq) {
    if (busy) return;
    if (mode === "setup") {
      const others = { wk: [wq, bk], wq: [wk, bk], bk: [wk, wq] }[placing];
      if (others.includes(sq)) return setError("That square is taken — choose an empty square.");
      setError(null);
      ({ wk: setWkName, wq: setWqName, bk: setBkName })[placing](sqName(sq));
      setHistory([]);
      setLastMove(null);
      setBlackMove(null);
      setMessage(null);
      return;
    }
    if (posError) return;
    if (sq === wk) return setSelected(selected === "K" ? null : "K");
    if (sq === wq) return setSelected(selected === "Q" ? null : "Q");
    const candidates = rows.filter((r) => r.dest === sq && (!selected || r.piece === selected));
    if (candidates.length) playMove(candidates[0].piece, candidates[0].dest); // best move landing there
    else setSelected(null);
  }

  // One tag per destination square: the best move landing there (of the selected piece, if any).
  const labels = {};
  for (const r of rows) {
    if (selected && r.piece !== selected) continue;
    if (labels[r.dest]) continue; // rows are sorted best first
    const g = r.grade;
    labels[r.dest] = {
      text: g === "unknown" ? "?" : valueTag(r.q),
      color: GRADE[g].color,
      glyph: glyph(r.piece),
      title: `${moveLabel(r.piece, r.dest_name)}: ${g === "unknown" ? "never tried by the agent" : `${valueMeaning(r.q)} (q = ${r.q.toFixed(3)})`}`,
    };
  }

  const summary = summarise(rows, source);
  const sourceProblem =
    needDp && !dpReady ? "The exact DP values are not loaded on this server yet." :
    needMc && !mcAvailable ? "No trained Monte Carlo agent yet — train one in Live Training (it runs in your browser), then come back." : null;

  return (
    <div className="page-grid">
      <Card className="board-card" tour="explore-board">
        {wk !== null && wq !== null && bk !== null ? (
          <ChessBoard
            wk={wk} wq={wq} bk={bk}
            squareLabels={labels}
            selected={selected === "K" ? wk : selected === "Q" ? wq : null}
            onSquareClick={handleSquareClick}
            lastMove={lastMove}
            blackMove={blackMove}
          />
        ) : <div className="empty">Type three valid squares on the right.</div>}

        <div className="board-status">
          <Badge tone={posError ? "fail" : "success"}>{posError ? `Illegal: ${posError}` : "Legal position · White to move"}</Badge>
          {busy && <span className="muted">loading…</span>}
        </div>
        {message && <div className="message">{message}</div>}
        <ErrorText>{error}</ErrorText>
        {ended && (
          <ResultBanner
            outcome={ended.outcome}
            who="You"
            moves={ended.moves}
            actions={[
              { label: "↶ Undo the last move", onClick: undo },
              { label: "Load the first example", variant: "secondary", onClick: () => loadExample("c6,e4,a8") },
            ]}
            onDismiss={() => setEnded(null)}
          />
        )}

        <div className="legend" data-tour="explore-legend">
          {(source === "mc" ? ["best", "close", "slower", "unknown"] : ["best", "close", "slower", "blunder"]).map((g) => (
            <span key={g}><i className="swatch" style={{ background: GRADE[g].color }} /> {GRADE[g].label}</span>
          ))}
        </div>
        <Callout tone="info" tour="explore-howto">
          <strong>How to read the board.</strong> Each tag sits on a square White can reach and says how good that move is:
          <strong> M1</strong> = mates now, <strong>M2</strong> = forced mate in 2, <strong>≈M3</strong> = about 3 moves on average,
          <strong> ✗</strong> = blunder. The small ♔/♕ tells which piece moves there. The agent always plays the green tag.
          Click a tag to play it — Black replies at random and the tags update.
        </Callout>
      </Card>

      <div className="side">
        <Card title="1 · Position" tone="soft" tour="explore-position">
          <Field label="Example" tour="explore-examples">
            <Select value="" onChange={loadExample} options={EXAMPLES} />
          </Field>
          <Field label="Board clicks" tour="explore-mode"
            info="Play moves: click the king/queen, then a tag — only legal moves. Set up: clicking a square puts the chosen piece there.">
            <Segmented value={mode} onChange={(v) => { setMode(v); setSelected(null); }}
              options={[{ value: "move", label: "Play moves" }, { value: "setup", label: "Set up" }]} />
          </Field>
          {mode === "setup" && (
            <Field label="Piece to place">
              <Segmented value={placing} onChange={setPlacing}
                options={[{ value: "wk", label: "♔ King" }, { value: "wq", label: "♕ Queen" }, { value: "bk", label: "♚ Black" }]} />
            </Field>
          )}
          <div className="square-inputs" data-tour="explore-squares">
            <label>♔ <TextInput value={wkName} onChange={(e) => setWkName(e.target.value)} invalid={wk === null} maxLength={2} /></label>
            <label>♕ <TextInput value={wqName} onChange={(e) => setWqName(e.target.value)} invalid={wq === null} maxLength={2} /></label>
            <label>♚ <TextInput value={bkName} onChange={(e) => setBkName(e.target.value)} invalid={bk === null} maxLength={2} /></label>
          </div>
          <Field label="Moves left (h)" tour="explore-h"
            info="The exact values depend on how many moves remain: with few moves left, slow plans become failures. The Monte Carlo agent ignores h.">
            <NumberInput value={h} min={1} max={40} onChange={(v) => setH(v === "" ? "" : Math.max(1, Math.min(40, v)))} disabled={source === "mc"} />
          </Field>
          <Button variant="secondary" block onClick={undo} disabled={!history.length} tour="explore-undo">↶ Undo last move</Button>
        </Card>

        <Card title="2 · Values from" tone="soft" tour="explore-source">
          <Segmented value={source} onChange={setSource}
            options={[{ value: "dp", label: "Exact (DP)" }, { value: "mc", label: "Learned (MC)" }, { value: "compare", label: "Compare" }]} />
          <div className="field-hint">
            {source === "dp" && "The true value of every move, computed from the rules (the answer key)."}
            {source === "mc" && "What a Monte Carlo agent learned by playing — estimates, possibly wrong."}
            {source === "compare" && "True value vs learned value side by side: where does the agent go wrong?"}
          </div>
          {needMc && <JobPicker />}
          {sourceProblem && <Callout tone="warn">{sourceProblem}</Callout>}
        </Card>

        {rows.length > 0 && (
          <Card title="3 · Moves, best first" tone="soft" tour="explore-list">
            {summary && <div className="summary">{summary}</div>}
            {mcChoiceRow && (
              <Callout tone={mcChoiceRow.grade === "best" ? "success" : "warn"}>
                The trained agent would play <strong>{moveLabel(mcChoice.piece, mcChoice.dest_name)}</strong>:
                {mcChoiceRow.grade === "best" ? " an optimal move ✓" : ` ${valueMeaning(mcChoiceRow.q)}, while the best is ${valueTag(rows[0].q)}.`}
              </Callout>
            )}
            {canonical && source !== "dp" && (
              <div className="field-hint">Learned values are shared by the 8 rotations/reflections of this board (stored as K{canonical.wk} Q{canonical.wq} vs K{canonical.bk}).</div>
            )}
            <div className="move-list">
              <div className="move-row move-head">
                <span>Move</span><span>{source === "compare" ? "Exact" : "Rating"}</span><span>{source === "compare" ? "Learned" : "Value"}</span>
              </div>
              {rows.map((r) => (
                <button type="button" key={`${r.piece}${r.dest}`} className="move-row"
                  onClick={() => mode === "move" && playMove(r.piece, r.dest)} disabled={mode !== "move" || busy}
                  title={mode === "move" ? "Play this move" : ""}>
                  <span>
                    <i className="swatch" style={{ background: GRADE[r.grade].color }} />
                    {glyph(r.piece)} {moveLabel(r.piece, r.dest_name)}
                    {r.grade === "best" && " ★"}
                    {r.kind === "checkmate" && <Badge tone="success">mate</Badge>}
                    {r.kind === "stalemate" && <Badge tone="fail">stalemate</Badge>}
                  </span>
                  <span>{r.grade === "unknown" ? "never tried" : valueTag(r.q)}</span>
                  <span className="num">
                    {source === "compare"
                      ? (r.mc ? (r.mc.visits === 0 ? "?" : r.mc.q.toFixed(3)) : "—")
                      : r.grade === "unknown" ? "—" : r.q.toFixed(3)}
                    {source === "mc" && r.visits > 0 && <small> · {r.visits}×</small>}
                  </span>
                </button>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

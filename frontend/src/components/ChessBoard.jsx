import { useEffect, useMemo, useRef, useState } from "react";

const FILES = "abcdefgh";
const LIGHT = "#F2EADC";
const DARK = "#C79A6B";
const WHITE_MOVE = "rgba(204,138,44,0.55)"; // gold tint: White's last move
const BLACK_MOVE = "rgba(22,42,75,0.30)"; // navy tint: Black's reply
const DOT = "#CC8A2C";

const GLYPH = { wK: "♔", wQ: "♕", bK: "♚" };

/**
 * Responsive board. Props:
 *  - wk, wq, bk: squares 0..63 (wq < 0 hides the queen, e.g. after capture)
 *  - legalDests: [{dest}] shown as dots
 *  - selected: square of the selected piece (gold ring)
 *  - lastMove / blackMove: {from, to} highlights
 *  - squareLabels: {sq: {text, color, title, glyph}} value tags
 */
export default function ChessBoard({
  wk, wq, bk,
  legalDests = [],
  selected = null,
  onSquareClick,
  lastMove,
  blackMove,
  squareLabels = {},
  maxSize = 440,
  tour,
}) {
  const wrapRef = useRef(null);
  const [size, setSize] = useState(maxSize);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width - 18; // room for rank numbers
      setSize(Math.max(220, Math.min(maxSize, Math.floor(w))));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [maxSize]);

  const cell = size / 8;
  const pieceAt = useMemo(() => {
    const m = {};
    if (wk >= 0) m[wk] = "wK";
    if (wq >= 0) m[wq] = "wQ";
    if (bk >= 0) m[bk] = "bK";
    return m;
  }, [wk, wq, bk]);
  const destSet = useMemo(() => new Set(legalDests.map((m) => m.dest)), [legalDests]);

  const squares = [];
  for (let rank = 7; rank >= 0; rank--) {
    for (let file = 0; file < 8; file++) {
      const sq = rank * 8 + file;
      const light = (file + rank) % 2 === 1;
      const piece = pieceAt[sq];
      const label = squareLabels[sq];
      let tint = null;
      if (blackMove && (blackMove.from === sq || blackMove.to === sq)) tint = BLACK_MOVE;
      if (lastMove && (lastMove.from === sq || lastMove.to === sq)) tint = WHITE_MOVE;

      squares.push(
        <div
          key={sq}
          className="sq"
          onClick={() => onSquareClick && onSquareClick(sq)}
          title={label?.title}
          style={{
            left: file * cell,
            top: (7 - rank) * cell,
            width: cell,
            height: cell,
            background: light ? LIGHT : DARK,
            cursor: onSquareClick ? "pointer" : "default",
            fontSize: cell * 0.66,
          }}
        >
          {tint && <div className="sq-tint" style={{ background: tint }} />}
          {selected === sq && <div className="sq-selected" />}
          {label && (
            <div className="sq-tag" style={{ background: label.color, fontSize: Math.max(10, cell * 0.22) }}>
              {label.glyph && <span className="sq-tag-glyph">{label.glyph}</span>}
              {label.text}
            </div>
          )}
          {piece && (
            <span className={`piece piece-${piece[0]}`} style={{ position: "relative", zIndex: 2 }}>
              {GLYPH[piece]}
            </span>
          )}
          {destSet.has(sq) && !piece && !label && (
            <div style={{ width: cell * 0.26, height: cell * 0.26, borderRadius: "50%", background: DOT, opacity: 0.85 }} />
          )}
        </div>
      );
    }
  }

  return (
    <div ref={wrapRef} className="board-wrap" data-tour={tour}>
      <div style={{ display: "flex" }}>
        <div className="board-ranks" style={{ height: size }}>
          {[8, 7, 6, 5, 4, 3, 2, 1].map((r) => (
            <div key={r} style={{ height: cell }}>{r}</div>
          ))}
        </div>
        <div className="board" style={{ width: size, height: size }}>
          {squares}
        </div>
      </div>
      <div className="board-files" style={{ width: size, marginLeft: 18 }}>
        {FILES.split("").map((f) => (
          <div key={f} style={{ width: cell }}>{f}</div>
        ))}
      </div>
    </div>
  );
}

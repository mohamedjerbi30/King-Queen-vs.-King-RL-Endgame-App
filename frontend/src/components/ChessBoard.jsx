import { useMemo } from "react";

const FILES = "abcdefgh";
const LIGHT = "#F2EADC";
const DARK = "#C79A6B";
const HILITE = "#B1503E";
const DOT = "#CC8A2C";

function sqToFileRank(sq) {
  return { f: sq % 8, r: Math.floor(sq / 8) };
}

const GLYPH = { wK: "♔", wQ: "♕", bK: "♚" };

export default function ChessBoard({
  wk,
  wq,
  bk,
  legalDests = [], // array of {dest, dest_name, piece} for the currently-selected piece
  selectedPiece, // 'K' | 'Q' | null
  onSquareClick,
  lastMove, // {from, to} squares to highlight, optional
  size = 420,
}) {
  const cell = size / 8;

  const pieceAt = useMemo(() => {
    const m = {};
    m[wk] = "wK";
    m[wq] = "wQ";
    m[bk] = "bK";
    return m;
  }, [wk, wq, bk]);

  const destSet = useMemo(() => new Set(legalDests.map((m) => m.dest)), [legalDests]);

  const squares = [];
  for (let rank = 7; rank >= 0; rank--) {
    for (let file = 0; file < 8; file++) {
      const sq = rank * 8 + file;
      const isLight = (file + rank) % 2 === 0;
      const isHighlighted =
        lastMove && (lastMove.from === sq || lastMove.to === sq);
      const isDot = destSet.has(sq);
      const piece = pieceAt[sq];

      squares.push(
        <div
          key={sq}
          onClick={() => onSquareClick && onSquareClick(sq)}
          style={{
            position: "absolute",
            left: file * cell,
            top: (7 - rank) * cell,
            width: cell,
            height: cell,
            background: isHighlighted ? HILITE : isLight ? LIGHT : DARK,
            opacity: isHighlighted ? 0.75 : 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: onSquareClick ? "pointer" : "default",
            fontSize: cell * 0.62,
            userSelect: "none",
            boxSizing: "border-box",
          }}
        >
          {piece && (
            <span
              style={{
                color: piece[0] === "w" ? "#FFFFFF" : "#162A4B",
                textShadow:
                  piece[0] === "w"
                    ? "0 0 2px #162A4B, 0 0 2px #162A4B"
                    : "0 0 1px #E8D9C0",
                lineHeight: 1,
              }}
            >
              {GLYPH[piece]}
            </span>
          )}
          {isDot && !piece && (
            <div
              style={{
                width: cell * 0.28,
                height: cell * 0.28,
                borderRadius: "50%",
                background: DOT,
                opacity: 0.85,
              }}
            />
          )}
          {isDot && piece && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                border: `3px solid ${DOT}`,
                borderRadius: "50%",
                boxSizing: "border-box",
                margin: 3,
              }}
            />
          )}
        </div>
      );
    }
  }

  return (
    <div style={{ display: "inline-block" }}>
      <div
        style={{
          position: "relative",
          width: size,
          height: size,
          boxShadow: "0 2px 18px rgba(22,42,75,0.18)",
          borderRadius: 6,
          overflow: "hidden",
        }}
      >
        {squares}
      </div>
      <div style={{ display: "flex", width: size, marginTop: 4 }}>
        {FILES.split("").map((f) => (
          <div
            key={f}
            style={{
              width: cell,
              textAlign: "center",
              fontSize: 11,
              color: "#6B7280",
              fontFamily: "sans-serif",
            }}
          >
            {f}
          </div>
        ))}
      </div>
    </div>
  );
}

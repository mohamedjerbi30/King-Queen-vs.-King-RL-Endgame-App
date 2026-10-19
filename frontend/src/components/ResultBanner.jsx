import { Button } from "../ui/index.jsx";

// What each way of ending a game means, in plain words.
const OUTCOMES = {
  checkmate: {
    tone: "win",
    icon: "♛",
    title: (n) => `Checkmate in ${n} move${n > 1 ? "s" : ""}!`,
    text: "The black king is attacked and has no legal square left. Success: reward +1.",
  },
  stalemate: {
    tone: "fail",
    icon: "½",
    title: () => "Stalemate — draw",
    text: "Black is not in check but has no legal move. In this project a draw counts as a failure: reward −1.",
  },
  queen_captured: {
    tone: "fail",
    icon: "✗",
    title: () => "The queen was captured",
    text: "The queen was left next to the black king without protection. A lone king cannot mate: reward −1.",
  },
  budget_exhausted: {
    tone: "fail",
    icon: "⌛",
    title: () => "Out of moves",
    text: "No checkmate within the move budget. Reward −1.",
  },
};

/**
 * Banner shown over the board when a game ends.
 *  who: who played White ("You", "The optimal agent"…), moves: White moves played,
 *  ret: discounted return G, actions: [{label, onClick, variant}].
 */
export default function ResultBanner({ outcome, who, moves, ret, actions = [], onDismiss }) {
  const o = OUTCOMES[outcome];
  if (!o) return null;
  return (
    <div className={`result-banner result-${o.tone}`} role="status" aria-live="polite" data-tour="result-banner">
      <div className="result-icon" aria-hidden="true">{o.icon}</div>
      <div className="result-body">
        <div className="result-title">{o.title(moves)}</div>
        <div className="result-text">{o.text}</div>
        <div className="result-stats">
          {who && <span>{who} played White</span>}
          <span>{moves} White move{moves > 1 ? "s" : ""}</span>
          {ret !== undefined && <span>return G = {ret.toFixed(4)}</span>}
          {outcome === "checkmate" && <span>optimal play averages 4.70 moves</span>}
        </div>
        <div className="result-actions">
          {actions.map((a) => (
            <Button key={a.label} variant={a.variant || "primary"} size="sm" onClick={a.onClick}>{a.label}</Button>
          ))}
          {onDismiss && <Button variant="ghost" size="sm" onClick={onDismiss}>Look at the board</Button>}
        </div>
      </div>
    </div>
  );
}

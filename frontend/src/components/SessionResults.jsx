import { useGameHistory, useRunHistory } from "../lib/history.js";
import { Badge, Button, Card } from "../ui/index.jsx";
import { METHODS } from "../lib/engine.js";

const WHO = {
  you: "You",
  dp: "Optimal agent (DP)",
  mc: "Trained agent (MC)",
  mixed: "Agents (DP + MC)",
};

const OUTCOME = {
  checkmate: ["success", "mate"],
  stalemate: ["fail", "stalemate"],
  queen_captured: ["fail", "queen lost"],
  budget_exhausted: ["fail", "out of moves"],
};

const pct = (x) => `${(100 * x).toFixed(0)}%`;

function summarise(games) {
  const groups = {};
  for (const g of games) (groups[g.who] ||= []).push(g);
  return Object.entries(groups).map(([who, list]) => {
    const wins = list.filter((g) => g.outcome === "checkmate");
    return {
      who,
      n: list.length,
      winRate: wins.length / list.length,
      moves: wins.length ? wins.reduce((s, g) => s + g.moves, 0) / wins.length : null,
      ret: list.reduce((s, g) => s + g.ret, 0) / list.length,
    };
  });
}

/** Results produced in this browser: games from Play and tests from Live Training. */
export default function SessionResults({ onNavigate }) {
  const [games, setGames] = useGameHistory();
  const [runsById, setRuns] = useRunHistory();
  const runs = Object.values(runsById).sort((a, b) => b.started_at - a.started_at);
  const empty = games.length === 0 && runs.length === 0;

  function clear() {
    if (window.confirm("Clear your games and training results from this browser?")) {
      setGames([]);
      setRuns({});
    }
  }

  return (
    <Card
      title="Your session"
      tour="dash-session"
      actions={!empty && <Button variant="ghost" size="sm" onClick={clear}>Clear my results</Button>}
    >
      {empty ? (
        <div className="session-empty">
          <p>
            <strong>No results yet.</strong> This section fills in as you use the app: every game you finish in{" "}
            <em>Play</em> and every agent you test in <em>Live Training</em> is recorded here (saved in this browser).
          </p>
          <div className="button-row">
            <Button onClick={() => onNavigate("play")}>Play a game</Button>
            <Button variant="secondary" onClick={() => onNavigate("train")}>Train an agent</Button>
          </div>
        </div>
      ) : (
        <div className="session-grid">
          <div>
            <div className="subhead">Games played</div>
            {games.length === 0 ? (
              <div className="muted">None yet — finish a game in Play.</div>
            ) : (
              <>
                <table className="table compact">
                  <thead><tr><th>Who played White</th><th>Games</th><th>Won</th><th>Moves to mate</th><th>Avg return</th></tr></thead>
                  <tbody>
                    {summarise(games).map((r) => (
                      <tr key={r.who}>
                        <td><strong>{WHO[r.who] || r.who}</strong></td>
                        <td>{r.n}</td>
                        <td>{pct(r.winRate)}</td>
                        <td>{r.moves ? r.moves.toFixed(1) : "—"}</td>
                        <td>{r.ret.toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="subhead">Last games</div>
                <div className="recent">
                  {games.slice(-8).reverse().map((g, i) => (
                    <span key={i} className="recent-item">
                      {WHO[g.who]?.split(" ")[0] || g.who} · {g.moves} moves
                      <Badge tone={OUTCOME[g.outcome]?.[0] || "neutral"}>{OUTCOME[g.outcome]?.[1] || g.outcome}</Badge>
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
          <div>
            <div className="subhead">Agents you trained (latest test)</div>
            {runs.length === 0 ? (
              <div className="muted">None yet — start a run in Live Training.</div>
            ) : (
              <table className="table compact">
                <thead><tr><th>Agent</th><th>Method</th><th>Decisions</th><th>Won</th><th>Moves</th><th>Avg return</th></tr></thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.job_id}>
                      <td>{r.job_id.startsWith("b") ? `${r.job_id.slice(1, 7)} (browser)` : `${r.job_id.slice(0, 6)} (server)`}</td>
                      <td>{r.params?.method ? METHODS[r.params.method] || r.params.method : "—"}</td>
                      <td>{r.evaluation.episodes.toLocaleString()}</td>
                      <td>{(100 * r.evaluation.mate_rate).toFixed(1)}%</td>
                      <td>{r.evaluation.mean_moves_to_mate?.toFixed(1) ?? "—"}</td>
                      <td>{r.evaluation.mean_return.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="field-hint">For comparison, the optimal agent wins 100% of games in 4.70 moves, with an average return of 0.927.</div>
          </div>
        </div>
      )}
    </Card>
  );
}

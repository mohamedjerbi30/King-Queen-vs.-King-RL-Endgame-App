// Guide steps for each page. `target` is a data-tour attribute inside the
// page; a leading "@" means a control outside the page (the header).
// Steps whose element is not currently visible are skipped automatically.

export const TOURS = {
  play: [
    { target: "@tabs", title: "Four pages", body: "Play a game, explore the values behind every move, train your own agent, and compare all results. Each page has its own guide." },
    { target: "play-board", title: "The board", body: "You are White (♔ king + ♕ queen) against the lone Black king ♚. Click your king or queen: dots show where it may legally go. Click a dot to move. Black then replies with a random legal move. Gold squares = your last move, blue = Black's reply." },
    { target: "play-status", title: "Game status", body: "Moves left in the budget and the return G collected so far: −0.01 for each move, +1 for checkmate, −1 for stalemate, losing the queen or running out of moves." },
    { target: "play-newgame", title: "New game", body: "Starts a random legal position. The budget is the number of White moves allowed (40 in the project). The same seed always gives the same start, so you can replay a game." },
    { target: "play-source", title: "Which agent?", body: "Optimal (DP) plays the exact best move, computed from the rules over all 144,508 positions. Trained (MC) plays what a Monte Carlo agent learned just by playing games — first create one in Live Training." },
    { target: "play-controls", title: "Agent controls", body: "▶ lets the agent play the whole game for you (⏸ pauses). 'Next agent move' plays one move. 'Hint' only shows what the agent would play, so you can compare with your idea." },
    { target: "play-speed", title: "Speed", body: "How fast the agent plays when you press ▶." },
    { target: "play-log", title: "Game record", body: "Every move in chess notation: '1. Qg6 Kd8' means White queen to g6, Black king to d8. '#' marks checkmate." },
    { target: "@guide", title: "Need this again?", body: "Click Guide at any time to replay this tour. Your games and settings are saved in this browser automatically." },
  ],
  explore: [
    { target: "explore-board", title: "Value of every move", body: "Each coloured tag sits on a square White can reach. It says how good that move is: M1 = mates now, M2 = forced mate in 2, ≈M3 = about 3 moves on average, ✗ = blunder. The small ♔/♕ shows which piece goes there. Hover a tag for details." },
    { target: "explore-legend", title: "Colours", body: "Green = the best move(s). Light green = about one move slower. Orange = clearly slower. Red = blunder. The agent always plays a green tag." },
    { target: "explore-howto", title: "Play through it", body: "Click a tag to play that move: Black answers randomly and all tags are recomputed for the new position. Click the ♔ or ♕ first to see only that piece's moves." },
    { target: "explore-examples", title: "Example positions", body: "Load ready-made positions: a mate in 2 where six moves are equally good, a trap where two queen moves lose the queen, a mate-in-1 next to a stalemate…" },
    { target: "explore-mode", title: "Play moves or set up", body: "'Play moves' = pieces move only by the rules. 'Set up' = clicking a square puts the chosen piece there, to build any position you like." },
    { target: "explore-squares", title: "Type a position", body: "You can also type the squares directly (♔ white king, ♕ queen, ♚ black king). A badge under the board tells you if the position is legal." },
    { target: "explore-h", title: "Moves left", body: "The exact values depend on how many moves remain: with only 2 moves left, a slow plan is worth −1. The trained Monte Carlo agent ignores this number." },
    { target: "explore-undo", title: "Undo", body: "Takes back your last move (and Black's reply)." },
    { target: "explore-source", title: "Where the values come from", body: "Exact (DP) = the true values, the answer key. Learned (MC) = estimates of a trained agent ('?' = a move it never tried). Compare = both side by side, to see where the agent is wrong." },
    { target: "explore-list", title: "All moves, best first", body: "The same moves as on the board, sorted from best to worst, with a one-sentence summary. Click a row to play that move." },
  ],
  train: [
    { target: "train-presets", title: "Pick a preset", body: "Report settings = the exact algorithm of the presentation (slow to start). Fast demo = learns visibly in under a minute. Custom = your own values." },
    { target: "train-settings", title: "Training settings", body: "Episodes = number of training games. α = how much each new result changes a value. ε = how often the agent tries a random move to explore. Q0 = the value of a move it has never tried. Hover the (i) icons for details." },
    { target: "train-buttons", title: "Start / stop", body: "Starts a training run on the server. You can change page while it runs: it keeps going, and this page re-attaches to it when you come back." },
    { target: "train-chart", title: "Learning curve", body: "Watch the agent improve live. The dark line = recent training games (noisy, includes exploration). Green dots = an exact test of what it learned. The dashed line is the best possible result, 0.927." },
    { target: "train-status", title: "This run", body: "Progress, time left and the size of the agent's table of values." },
    { target: "train-evaluate", title: "Test the agent exactly", body: "Tests the current policy on all 144,508 positions with no randomness: mate rate, average return, moves to mate, and how often it picks a truly best move. Also runs automatically at the end." },
    { target: "train-results", title: "Test results", body: "Compare with the optimal agent: 100% mates, 4.70 moves, return 0.9271." },
    { target: "@tabs", title: "Use your agent", body: "Your trained agent is now available in Play (Trained) and in Explore (Learned / Compare)." },
  ],
  dashboard: [
    { target: "dash-mate", title: "Games won", body: "How often each policy checkmates within 40 moves, from a random start: random play 1.2%, 'safe' random 15.9%, the trained Monte Carlo agent >99.99%, the optimal agent 100%." },
    { target: "dash-return", title: "Average result", body: "The mean return (between −1 and +1). It also rewards speed: the optimal agent scores 0.927 because it mates in 4.7 moves on average." },
    { target: "dash-check", title: "Checking the report", body: "The server recomputes these numbers exactly and puts ✓ when they match the presentation." },
    { target: "dash-curves", title: "Learning speed", body: "How good the Monte Carlo agent is after 1k to 500k training games, for three settings. The report's settings start slowly but are the most accurate after 100 million games." },
    { target: "dash-compare", title: "DP vs Monte Carlo", body: "DP computes the answer from the rules; Monte Carlo learns it from experience. DP is the answer key the learned agent is graded against." },
    { target: "dash-mdp", title: "The problem in numbers", body: "144,508 positions, a 40-move budget, discount 0.99 and the reward table. Hover the (i) icons for explanations." },
  ],
};

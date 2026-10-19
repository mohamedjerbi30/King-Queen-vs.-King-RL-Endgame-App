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
    { target: "@backend-status", title: "Which server?", body: "This line shows the backend the app is connected to (for the hosted site, the Render server), whether it is online, its mode, and whether the exact DP solution is loaded. 'open /api/health' lets you check it yourself." },
    { target: "@guide", title: "Need this again?", body: "Click Guide at any time to replay this tour. Your games and settings are saved in this browser automatically." },
  ],
  explore: [
    { target: "explore-board", title: "Value of every move", body: "Each coloured tag sits on a square White can reach. It says how good that move is: M1 = mates now, M2 = forced mate in 2, ≈M3 = about 3 moves on average, ✗ = blunder. The small ♔/♕ shows which piece goes there. Hover a tag for details." },
    { target: "explore-legend", title: "Colours", body: "Green = the best move(s). Light green = about one move slower. Orange = clearly slower. Red = blunder. The agent always plays a green tag." },
    { target: "explore-howto", title: "Play through it", body: "Click a tag to play that move: Black answers randomly and all tags are recomputed for the new position. Click the ♔ or ♕ first to see only that piece's moves." },
    { target: "explore-examples", title: "Example positions", body: "Load ready-made positions: a mate in 2 where six moves are equally good, a trap where two queen moves lose the queen, a mate-in-1 next to a stalemate…" },
    { target: "explore-mode", title: "Play moves or set up", body: "'Play moves' = pieces move only by the rules. 'Set up' = clicking a square puts the chosen piece there, to build any position you like." },
    { target: "explore-squares", title: "Type a position", body: "You can also type the squares directly (♔ white king, ♕ queen, ♚ black king). A badge under the board tells you if the position is legal." },
    { target: "explore-h", title: "Moves left", body: "The exact values depend on how many moves remain: with only 2 moves left, a slow plan is worth −1. Learned agents also store a separate value for every number of moves left." },
    { target: "explore-undo", title: "Undo", body: "Takes back your last move (and Black's reply)." },
    { target: "explore-source", title: "Where the values come from", body: "Exact (DP) = the true values, the answer key. Learned = estimates of an agent you trained (MC or TD; '?' = a move it never tried). Compare = both side by side, to see where the agent is wrong." },
    { target: "explore-list", title: "All moves, best first", body: "The same moves as on the board, sorted from best to worst, with a one-sentence summary. Click a row to play that move." },
  ],
  train: [
    { target: "train-where", title: "Where to train", body: "This browser = the agent trains on your own computer in the background (about 10,000 games per second) and is saved in this browser — it works everywhere, also on the hosted version. Server = trains on the backend with exact tests, only when a local or long-running server is available." },
    { target: "train-method", title: "Pick a method", body: "The five learners compared in the report: MC (mean), MC (constant α), SARSA, Expected SARSA and Q-learning — the method the report selects. All use the report's representation (board + moves left h, symmetry-shared) and settings." },
    { target: "train-presets", title: "Pick a budget", body: "Quick demo = 2 million decisions (a few seconds). Report budget = 20 million decisions, exactly the report's setting — about a minute in the browser — so you can reproduce its results yourself." },
    { target: "train-settings", title: "Training settings", body: "α = how much each new result changes a value; Q0 = the value of a move never tried (0 in the report). Exploration ε follows the report's schedule automatically. Hover the (i) icons for details." },
    { target: "train-buttons", title: "Start / stop", body: "Starts training. You can switch pages while it runs (keep the tab open for browser training); the curve and the agent stay available." },
    { target: "train-chart", title: "Learning curve", body: "Watch the agent improve live. The dark line = recent training games (noisy, includes exploration). Green dots = an exact test of what it learned. The dashed line is the best possible result, 0.927." },
    { target: "train-status", title: "This run", body: "Progress, time left and the size of the agent's table of values." },
    { target: "train-evaluate", title: "Test the agent exactly", body: "Tests the learned policy with no exploration: on 5,000 fixed positions in the browser (an estimate), or exactly on all 144,508 positions on the server. Runs automatically during and at the end of training." },
    { target: "train-results", title: "Test results", body: "Compare with the optimal agent: 100% mates, 4.70 moves, return 0.9271." },
    { target: "@tabs", title: "Use your agent", body: "Your trained agent is now available in Play (Trained) and in Explore (Learned / Compare)." },
  ],
  dashboard: [
    { target: "dash-session", title: "Your results", body: "Everything you did in this browser: games finished in Play (by you, the optimal agent or a trained agent) and every agent you trained and tested in Live Training. It is empty until you play or train." },
    { target: "dash-reference", title: "Reference numbers", body: "Below this line are the project report's numbers — not your session. They are the benchmark your games and agents can be compared with." },
    { target: "dash-mate", title: "Games won", body: "How often each policy checkmates within 40 moves, from a random start: random play 1.2%, 'safe' random 15.9%, Monte Carlo 89.6% and Q-learning 92.9% (report, 20 million decisions), the optimal agent 100%." },
    { target: "dash-return", title: "Average result", body: "The mean return (between −1 and +1). It also rewards speed: the optimal agent scores 0.927 because it mates in 4.7 moves on average." },
    { target: "dash-check", title: "Checking the report", body: "The server recomputes these numbers exactly and puts ✓ when they match the presentation." },
    { target: "dash-comparison", title: "MC vs TD", body: "The report's controlled comparison of the five learning methods under the same budget (20 million decisions, 3 seeds). The TD methods beat Monte Carlo; Q-learning is the method the report selects. 'Certified' shows how rarely a learned policy forces mate against every defence." },
    { target: "dash-compare", title: "DP vs Monte Carlo", body: "DP computes the answer from the rules; MC and TD learn it from experience. DP is the answer key the learned agents are graded against." },
    { target: "dash-mdp", title: "The problem in numbers", body: "144,508 positions, a 40-move budget, discount 0.99 and the reward table. Hover the (i) icons for explanations." },
  ],
};

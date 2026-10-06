import { useState } from "react";
import PlayMode from "./components/PlayMode.jsx";
import ExploreMode from "./components/ExploreMode.jsx";
import TrainMode from "./components/TrainMode.jsx";
import DashboardMode from "./components/DashboardMode.jsx";

const MODES = [
  { key: "play", label: "Play" },
  { key: "explore", label: "Explore Q-table" },
  { key: "train", label: "Live Training" },
  { key: "dashboard", label: "Results Dashboard" },
];

export default function App() {
  const [mode, setMode] = useState("play");

  return (
    <div className="app-shell">
      <div className="app-header">
        <div>
          <h1 className="app-title">King &amp; Queen vs. King</h1>
          <div className="app-subtitle">
            A reinforcement-learning endgame study — finite-horizon DP vs. Monte Carlo control
          </div>
        </div>
        <div className="mode-switcher">
          {MODES.map((m) => (
            <button
              key={m.key}
              className={`mode-btn${mode === m.key ? " active" : ""}`}
              onClick={() => setMode(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {mode === "play" && <PlayMode />}
      {mode === "explore" && <ExploreMode />}
      {mode === "train" && <TrainMode />}
      {mode === "dashboard" && <DashboardMode />}
    </div>
  );
}

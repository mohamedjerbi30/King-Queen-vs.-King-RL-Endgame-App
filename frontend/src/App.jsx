import { useEffect, useState } from "react";
import PlayMode from "./components/PlayMode.jsx";
import ExploreMode from "./components/ExploreMode.jsx";
import TrainMode from "./components/TrainMode.jsx";
import DashboardMode from "./components/DashboardMode.jsx";
import Tour from "./tour/Tour.jsx";
import { TOURS } from "./tour/tours.js";
import { clearStored, usePersistentState } from "./lib/storage.js";
import { Button } from "./ui/index.jsx";

const MODES = [
  { key: "play", label: "Play", blurb: "Play the endgame yourself or watch an agent mate." },
  { key: "explore", label: "Explore values", blurb: "See how good every move is — the agent's Q-table." },
  { key: "train", label: "Live Training", blurb: "Train your own Monte Carlo agent and watch it learn." },
  { key: "dashboard", label: "Results", blurb: "The project's results, checked exactly." },
];

export default function App() {
  const [mode, setMode] = usePersistentState("mode", "play");
  const [seen, setSeen] = usePersistentState("tour.seen", {});
  const [always, setAlways] = usePersistentState("tour.always", false);
  const [tourOpen, setTourOpen] = useState(false);

  // Open the guide automatically when a page is shown for the first time
  // (or every time, if the user ticked "show every time").
  useEffect(() => {
    if (!always && seen[mode]) return;
    const t = setTimeout(() => setTourOpen(true), 500); // let the page lay out first
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  function closeTour() {
    setTourOpen(false);
    setSeen({ ...seen, [mode]: true });
  }

  function switchTo(key) {
    setTourOpen(false);
    setMode(key);
  }

  function resetSaved() {
    if (window.confirm("Forget all saved games, positions, settings and guide progress in this browser?")) {
      clearStored();
      window.location.reload();
    }
  }

  const current = MODES.find((m) => m.key === mode) || MODES[0];

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1 className="app-title">King &amp; Queen vs. King</h1>
          <div className="app-subtitle">A reinforcement-learning endgame study — exact DP vs. Monte Carlo control</div>
        </div>
        <div className="header-actions">
          <Button variant="secondary" size="sm" onClick={() => setTourOpen(true)} tour="guide" title="Explain every control on this page">
            ? Guide
          </Button>
          <Button variant="ghost" size="sm" onClick={resetSaved} title="Clear everything this app saved in your browser">
            Reset saved data
          </Button>
        </div>
      </header>

      <nav className="tabs" data-tour="tabs" role="tablist">
        {MODES.map((m) => (
          <button key={m.key} type="button" role="tab" aria-selected={mode === m.key}
            className={`tab${mode === m.key ? " active" : ""}`} onClick={() => switchTo(m.key)}>
            {m.label}
          </button>
        ))}
      </nav>
      <p className="page-blurb">{current.blurb}</p>

      {/* All pages stay mounted so games, positions and training views survive tab switches. */}
      <main>
        <div id="page-play" hidden={mode !== "play"}><PlayMode active={mode === "play"} /></div>
        <div id="page-explore" hidden={mode !== "explore"}><ExploreMode /></div>
        <div id="page-train" hidden={mode !== "train"}><TrainMode /></div>
        <div id="page-dashboard" hidden={mode !== "dashboard"}><DashboardMode /></div>
      </main>

      {tourOpen && (
        <Tour key={mode} scope={mode} steps={TOURS[mode]} onClose={closeTour} always={always} onAlwaysChange={setAlways} />
      )}
    </div>
  );
}

// Guided tour: dims the page, spotlights one control at a time and shows a
// comment bubble next to it. Steps point at elements by their data-tour
// attribute, looked up inside the active page (#page-<key>) or, for steps
// whose target starts with "@", anywhere in the document (header controls).
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const PAD = 6;
const BUBBLE_W = 340;

function findTarget(scope, target) {
  const sel = `[data-tour="${target.replace(/^@/, "")}"]`;
  const root = target.startsWith("@") ? document : document.getElementById(`page-${scope}`);
  const el = root && root.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? el : null;
}

/** Put the bubble next to the target without leaving the viewport: below,
 *  above, right, left — or, for a target bigger than the screen, in a corner. */
function placeBubble(rect, h) {
  const vw = window.innerWidth, vh = window.innerHeight, M = 12;
  const width = Math.min(BUBBLE_W, vw - 2 * M);
  const clampX = (x) => Math.max(M, Math.min(x, vw - width - M));
  const clampY = (y) => Math.max(M, Math.min(y, vh - h - M));
  const centerX = clampX(rect.left + rect.width / 2 - width / 2);
  if (rect.bottom + PAD + M + h <= vh) return { top: rect.bottom + PAD + M, left: centerX, width };
  if (rect.top - PAD - M - h >= 0) return { top: rect.top - PAD - M - h, left: centerX, width };
  if (rect.right + PAD + M + width <= vw) return { top: clampY(rect.top), left: rect.right + PAD + M, width };
  if (rect.left - PAD - M - width >= 0) return { top: clampY(rect.top), left: rect.left - PAD - M - width, width };
  return { top: vh - h - M, left: vw - width - M, width };
}

export default function Tour({ scope, steps, onClose, always, onAlwaysChange }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const [bubbleH, setBubbleH] = useState(230);
  const bubbleRef = useRef(null);

  // Measure the real bubble height (it depends on the text) to place it correctly.
  useLayoutEffect(() => {
    if (bubbleRef.current) {
      const h = bubbleRef.current.offsetHeight;
      if (Math.abs(h - bubbleH) > 2) setBubbleH(h);
    }
  });

  // Steps whose element is not on screen right now (e.g. a card that only
  // appears after training) are skipped.
  const available = steps.filter((s) => findTarget(scope, s.target));
  const step = available[Math.min(index, available.length - 1)];

  const measure = useCallback(() => {
    if (!step) return;
    const el = findTarget(scope, step.target);
    if (el) setRect(el.getBoundingClientRect());
  }, [scope, step]);

  useLayoutEffect(() => {
    if (!step) return;
    const el = findTarget(scope, step.target);
    if (!el) return;
    el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    measure();
    const t = setTimeout(measure, 350); // after smooth scrolling settles
    return () => clearTimeout(t);
  }, [scope, step, measure]);

  useEffect(() => {
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [measure]);

  const last = index >= available.length - 1;
  const next = useCallback(() => (last ? onClose() : setIndex((i) => i + 1)), [last, onClose]);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" || e.key === "Enter") next();
      else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, back, onClose]);

  if (!step || !rect) return null;

  const { top, left, width } = placeBubble(rect, bubbleH);

  return (
    <div className="tour-root" role="dialog" aria-modal="true" aria-label="Page guide">
      <div className="tour-blocker" onClick={(e) => e.stopPropagation()} />
      <div
        className="tour-spot"
        style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + 2 * PAD, height: rect.height + 2 * PAD }}
      />
      <div className="tour-bubble" ref={bubbleRef} style={{ top, left, width }}>
        <div className="tour-step">
          Step {index + 1} of {available.length}
        </div>
        <div className="tour-title">{step.title}</div>
        <div className="tour-body">{step.body}</div>
        <label className="tour-always">
          <input type="checkbox" checked={always} onChange={(e) => onAlwaysChange(e.target.checked)} />
          Show this guide every time I open a page
        </label>
        <div className="tour-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Skip guide
          </button>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn btn-secondary btn-sm" onClick={back} disabled={index === 0}>
            Back
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={next} autoFocus>
            {last ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

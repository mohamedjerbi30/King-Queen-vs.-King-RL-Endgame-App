// Small, reusable UI building blocks. Every page composes these instead of
// styling raw <button>/<select>/<input> elements, so controls look and behave
// the same everywhere. `tour` sets data-tour, the anchor used by the guide.
import { useId, useState } from "react";

export function Button({ variant = "primary", size = "md", block, tour, children, ...rest }) {
  return (
    <button
      type="button"
      className={`btn btn-${variant} btn-${size}${block ? " btn-block" : ""}`}
      data-tour={tour}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Card({ title, tone = "plain", tour, actions, children, className = "", ...rest }) {
  return (
    <section className={`card card-${tone} ${className}`} data-tour={tour} {...rest}>
      {(title || actions) && (
        <header className="card-head">
          {title && <h2 className="card-title">{title}</h2>}
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/** Label + control + optional hint, laid out as one row. */
export function Field({ label, hint, info, tour, children }) {
  return (
    <div className="field" data-tour={tour}>
      <div className="field-row">
        <span className="field-label">
          {label}
          {info && <InfoTip text={info} />}
        </span>
        <span className="field-control">{children}</span>
      </div>
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

export function TextInput({ invalid, ...rest }) {
  return <input type="text" className={`input${invalid ? " input-invalid" : ""}`} spellCheck={false} {...rest} />;
}

export function NumberInput({ value, onChange, min, max, step = 1, ...rest }) {
  return (
    <input
      type="number"
      className="input"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const v = e.target.value === "" ? "" : Number(e.target.value);
        onChange(v);
      }}
      {...rest}
    />
  );
}

export function Select({ value, onChange, options, tour, ...rest }) {
  return (
    <span className="select-wrap" data-tour={tour}>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)} {...rest}>
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  );
}

/** A row of mutually exclusive buttons — replaces scattered radio buttons. */
export function Segmented({ value, onChange, options, tour, block = true }) {
  return (
    <div className={`segmented${block ? " segmented-block" : ""}`} role="radiogroup" data-tour={tour}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={`seg-btn${value === o.value ? " active" : ""}`}
          disabled={o.disabled}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function StatRow({ label, value, info, tone }) {
  return (
    <div className="stat-row">
      <span className="label">
        {label}
        {info && <InfoTip text={info} />}
      </span>
      <span className={`value${tone ? ` tone-${tone}` : ""}`}>{value}</span>
    </div>
  );
}

export function Badge({ tone = "neutral", children, ...rest }) {
  return (
    <span className={`badge badge-${tone}`} {...rest}>
      {children}
    </span>
  );
}

export function Callout({ tone = "info", tour, children }) {
  return (
    <div className={`callout callout-${tone}`} data-tour={tour}>
      {children}
    </div>
  );
}

/** A small (i) that explains a technical term on hover / focus / tap. */
export function InfoTip({ text }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="infotip" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        className="infotip-btn"
        aria-describedby={id}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
      >
        i
      </button>
      {open && (
        <span role="tooltip" id={id} className="infotip-bubble">
          {text}
        </span>
      )}
    </span>
  );
}

export function ProgressBar({ value, max, label }) {
  const pct = max ? Math.min(100, (100 * value) / max) : 0;
  return (
    <div className="progress" aria-label={label}>
      <div className="progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function ErrorText({ children }) {
  if (!children) return null;
  return <div className="error-text">{children}</div>;
}

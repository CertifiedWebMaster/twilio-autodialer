import { OUTCOMES } from "../lib/api";

export function OutcomeBadge({ outcome }) {
  const o = OUTCOMES.find((x) => x.key === outcome);
  if (!o) return <span className="text-slate-500 text-xs">—</span>;
  return <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${o.cls}`}>{o.label}</span>;
}

const STATUS = {
  pending: "text-slate-300 bg-white/5 border-white/10",
  in_progress: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
  callback: "text-sky-300 bg-sky-500/10 border-sky-500/30",
  completed: "text-slate-400 bg-white/[0.03] border-white/10",
};

export function StatusBadge({ status }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS[status] || STATUS.pending}`}>
      {String(status || "").replace("_", " ")}
    </span>
  );
}

export function Progress({ stats, total }) {
  const done = stats.completed || 0;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3 min-w-[140px]">
      <div className="h-1.5 flex-1 rounded-full bg-white/5 overflow-hidden">
        <div className="h-full bg-gradient-to-r from-accent to-emerald-400 transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs text-slate-400 w-10 text-right">{pct}%</span>
    </div>
  );
}

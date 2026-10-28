import { Check, Loader2 } from "lucide-react";
import { OUTCOMES } from "../../lib/api";

export default function DispositionPanel({ phase, form, setForm, onSave, saving }) {
  const canSave = phase === "wrap" && form.outcome && (form.outcome !== "callback" || form.callbackAt);
  const enabled = ["ringing", "live", "wrap"].includes(phase);
  return (
    <aside className={`card p-6 flex flex-col gap-5 transition-opacity ${enabled ? "" : "opacity-50"}`} data-testid="disposition-panel">
      <div>
        <div className="label mb-1">Call outcome</div>
        <p className="text-xs text-slate-500">Pick what happened, add notes, then save to move on.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {OUTCOMES.map((o) => {
          const on = form.outcome === o.key;
          return (
            <button key={o.key} disabled={!enabled} onClick={() => setForm({ ...form, outcome: o.key })} data-testid={`disposition-outcome-${o.key}`}
              className={`rounded-xl border px-3 py-2.5 text-sm font-medium text-left transition-[background-color,border-color,transform] active:scale-[.97] ${on ? o.cls : "border-white/10 text-slate-300 hover:bg-white/5"}`}>
              {o.label}
            </button>
          );
        })}
      </div>
      {form.outcome === "callback" && (
        <label className="flex flex-col gap-2">
          <span className="label">Call back at</span>
          <input type="datetime-local" className="input" value={form.callbackAt} onChange={(e) => setForm({ ...form, callbackAt: e.target.value })} data-testid="disposition-callback-input" />
        </label>
      )}
      <label className="flex flex-col gap-2 flex-1">
        <span className="label">Notes</span>
        <textarea rows={5} disabled={!enabled} className="input resize-none flex-1 min-h-[120px]" placeholder="What did they say?" value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="disposition-notes-input" />
      </label>
      <button className="btn-primary !py-3" disabled={!canSave || saving} onClick={onSave} data-testid="disposition-save-btn">
        {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
        {phase === "live" || phase === "ringing" ? "Save after hang up" : "Save outcome"}
      </button>
    </aside>
  );
}

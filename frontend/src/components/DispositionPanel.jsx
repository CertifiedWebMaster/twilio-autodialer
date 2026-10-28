import { useState } from "react";
import { useAuth } from "@clerk/react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { OUTCOMES } from "../lib/api";
import { streamAI } from "../lib/twilio";

export default function DispositionPanel({ callId, value, onChange, canSave, saving, onSave, onSkip }) {
  const { getToken } = useAuth();
  const [tidying, setTidying] = useState(false);
  const set = (patch) => onChange({ ...value, ...patch });

  const tidy = async () => {
    setTidying(true);
    let out = "";
    try {
      await streamAI("/ai/tidy-notes", { call_id: callId, notes: value.notes, outcome: value.outcome }, await getToken(), (t) => {
        out += t;
        onChange({ ...value, notes: out });
      });
    } catch (e) { toast.error(e.message); }
    setTidying(false);
  };

  return (
    <div className="card p-5 md:p-6 flex flex-col gap-5" data-testid="disposition-panel">
      <div>
        <div className="label mb-1">Wrap-up</div>
        <h2 className="font-display text-xl font-bold text-white">Call outcome</h2>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {OUTCOMES.map((o) => (
          <button key={o.key} disabled={!callId} onClick={() => set({ outcome: o.key })} data-testid={`disposition-outcome-${o.key}`}
            className={`rounded-xl border px-3 py-2.5 text-sm font-medium text-left transition-[background-color,border-color,transform] active:scale-[.97] disabled:opacity-30 ${value.outcome === o.key ? `${o.cls} ring-1 ring-current` : "border-white/10 text-slate-300 hover:bg-white/5"}`}>
            {o.label}
          </button>
        ))}
      </div>
      {value.outcome === "callback" && (
        <label className="block">
          <span className="label">Call back at</span>
          <input type="datetime-local" className="input mt-2" value={value.callback_at} onChange={(e) => set({ callback_at: e.target.value })} data-testid="disposition-callback-input" />
        </label>
      )}
      <label className="block">
        <div className="flex items-center justify-between">
          <span className="label">Notes</span>
          <button className="text-xs text-accent hover:text-white flex items-center gap-1 disabled:opacity-40" onClick={tidy} disabled={!callId || !value.notes.trim() || tidying} data-testid="disposition-ai-tidy-btn">
            <Sparkles size={12} />{tidying ? "Tidying…" : "Tidy with AI"}
          </button>
        </div>
        <textarea rows={6} className="input mt-2 resize-none" placeholder="What happened on the call?" disabled={!callId}
          value={value.notes} onChange={(e) => set({ notes: e.target.value })} data-testid="disposition-notes-input" />
      </label>
      <div className="flex gap-2">
        <button className="btn-primary flex-1" disabled={!canSave || !value.outcome || saving} onClick={onSave} data-testid="disposition-save-btn">
          {saving ? "Saving…" : "Save outcome"}
        </button>
        <button className="btn-ghost" disabled={!canSave || saving} onClick={onSkip} data-testid="disposition-skip-btn">Skip</button>
      </div>
      {callId && !canSave && <p className="text-xs text-slate-500 -mt-2">You can save once the call ends.</p>}
    </div>
  );
}

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { OUTCOMES, errMsg, useApi } from "../lib/api";
import { streamAI } from "../lib/twilio";

export default function DispositionPanel({ callId, value, onChange, canSave, saving, onSave, onSkip }) {
  const { getToken } = useAuth();
  const api = useApi();
  const [tidying, setTidying] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [ai, setAi] = useState(null);
  const set = (patch) => onChange({ ...value, ...patch });

  useEffect(() => setAi(null), [callId]);

  const suggest = async () => {
    setSuggesting(true);
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const localNow = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())} (${d.toLocaleDateString([], { weekday: "long" })})`;
    try {
      const { data } = await api.post("/ai/suggest-outcome", { call_id: callId, notes: value.notes, local_now: localNow });
      setAi(data);
      onChange({ ...value, outcome: data.outcome, ...(data.callback_at && { callback_at: data.callback_at }) });
    } catch (e) { toast.error(errMsg(e)); }
    setSuggesting(false);
  };

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
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="label mb-1">Wrap-up</div>
          <h2 className="font-display text-xl font-bold text-white">Call outcome</h2>
        </div>
        <button className="btn-ghost !py-1.5 !px-3 text-xs" onClick={suggest} disabled={!callId || !value.notes.trim() || suggesting}
          title={value.notes.trim() ? "Let AI pick the outcome from your notes" : "Write notes first"} data-testid="disposition-ai-suggest-btn">
          <Wand2 size={13} className="text-accent" />{suggesting ? "Thinking…" : "Suggest from notes"}
        </button>
      </div>
      {ai && (
        <div className="rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-slate-200 animate-rise" data-testid="disposition-ai-suggestion">
          <span className="font-semibold text-white">AI pick: {OUTCOMES.find((o) => o.key === ai.outcome)?.label}</span>
          {ai.reason && <span className="text-slate-400"> — {ai.reason}</span>}
          <div className="text-slate-500 mt-0.5">Change it if it's wrong, then save.</div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {OUTCOMES.map((o) => (
          <button key={o.key} disabled={!callId} onClick={() => set({ outcome: o.key })} data-testid={`disposition-outcome-${o.key}`}
            className={`relative rounded-xl border px-3 py-2.5 text-sm font-medium text-left transition-[background-color,border-color,transform] active:scale-[.97] disabled:opacity-30 ${value.outcome === o.key ? `${o.cls} ring-1 ring-current` : "border-white/10 text-slate-300 hover:bg-white/5"}`}>
            {o.label}
            {ai?.outcome === o.key && <Wand2 size={11} className="absolute top-1.5 right-1.5 opacity-70" />}
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

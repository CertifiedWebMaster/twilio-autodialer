import { useState } from "react";
import { PhoneIncoming, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { errMsg, useApi } from "../lib/api";

export default function CallerVerify({ onRefresh }) {
  const api = useApi();
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState(null);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/twilio/verify-caller", { number, name });
      setCode(data);
      toast.success(`Twilio is calling ${data.number} now`);
    } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };

  return (
    <div className="mt-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4" data-testid="caller-verify-panel">
      <div className="flex items-center gap-2 mb-1"><PhoneIncoming size={15} className="text-accent" /><span className="text-sm font-semibold text-white">Add a caller ID</span></div>
      <p className="text-xs text-slate-400 mb-4">Use your own cell or office number. Twilio calls it, and you type the code shown here on that phone's keypad.</p>
      <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2">
        <input className="input" placeholder="(555) 123-4567" value={number} onChange={(e) => setNumber(e.target.value)} data-testid="caller-verify-number-input" />
        <input className="input" placeholder="Label, e.g. Office line" value={name} onChange={(e) => setName(e.target.value)} data-testid="caller-verify-name-input" />
        <button className="btn-primary" disabled={!number.trim() || busy} onClick={start} data-testid="caller-verify-start-btn">{busy ? "Calling…" : "Verify number"}</button>
      </div>
      {code && (
        <div className="mt-4 flex flex-wrap items-center gap-4 animate-rise" data-testid="caller-verify-code-box">
          <div>
            <div className="label !text-[10px]">Enter this code when Twilio calls {code.number}</div>
            <div className="font-mono text-3xl font-semibold tracking-[0.3em] text-emerald-300" data-testid="caller-verify-code">{code.validation_code}</div>
          </div>
          <button className="btn-ghost" onClick={() => { onRefresh(); setCode(null); }} data-testid="caller-verify-refresh-btn"><RefreshCw size={14} />I entered it — refresh list</button>
        </div>
      )}
    </div>
  );
}

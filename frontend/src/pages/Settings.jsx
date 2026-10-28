import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, Loader2, PlugZap, XCircle } from "lucide-react";
import { errMsg, useApi } from "../lib/api";
import { useMe } from "../lib/me";
import PageHeader from "../components/PageHeader";
import CallerVerify from "../components/CallerVerify";

function Row({ ok, label, children, testid }) {
  return (
    <div className="flex flex-wrap items-center gap-3 py-4 border-t border-white/[0.06] first:border-0" data-testid={testid}>
      {ok ? <CheckCircle2 className="text-emerald-400" size={18} /> : <XCircle className="text-slate-600" size={18} />}
      <span className="text-sm text-white flex-1 min-w-[180px]">{label}</span>
      {children}
    </div>
  );
}

export default function Settings() {
  const api = useApi();
  const me = useMe();
  const [st, setSt] = useState(null);
  const [nums, setNums] = useState([]);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.get("/twilio/status").then((r) => setSt(r.data)).catch((e) => toast.error(errMsg(e))), [api]);
  const loadNums = useCallback(() => api.get("/twilio/numbers").then((r) => setNums(r.data)).catch((e) => toast.error(errMsg(e))), [api]);
  useEffect(() => { if (me.role === "admin") load(); }, [load, me.role]);
  useEffect(() => { if (st?.has_credentials) loadNums(); }, [loadNums, st?.has_credentials]);
  if (me.role !== "admin") return <Navigate to="/" replace />;

  const connect = async () => {
    setBusy(true);
    try { const { data } = await api.post("/twilio/setup"); setSt(data); toast.success("Browser calling is connected"); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const pickCaller = async (caller_id) => {
    try { const { data } = await api.patch("/twilio/caller-id", { caller_id }); setSt(data); toast.success("Caller ID saved"); }
    catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <div data-testid="twilio-settings-page">
      <PageHeader eyebrow="Admin" title="Settings" />
      <section className="card p-6 max-w-3xl">
        <div className="flex items-center gap-3 mb-2">
          <PlugZap className="text-accent" size={20} />
          <h2 className="font-display text-xl font-bold text-white">Twilio calling</h2>
          {st && <span className={`ml-auto rounded-full border px-3 py-1 text-xs font-semibold ${st.connected && st.caller_id ? "text-emerald-300 border-emerald-500/40 bg-emerald-500/10" : "text-amber-300 border-amber-500/30 bg-amber-500/10"}`} data-testid="twilio-settings-status-pill">{st.connected && st.caller_id ? "Ready to dial" : "Setup needed"}</span>}
        </div>
        <p className="text-sm text-slate-400 mb-4">Calls are billed to your Twilio account. Run “Connect” again after publishing so calls route to the live site.</p>
        {!st ? <Loader2 className="animate-spin text-slate-500" /> : (
          <div>
            <Row ok={st.has_credentials} label="Twilio Account SID & Auth Token added" testid="twilio-settings-credentials-row">
              {!st.has_credentials && <span className="text-xs text-slate-500">Ask in chat to add your Twilio keys</span>}
            </Row>
            <Row ok={st.connected} label="Browser calling connected" testid="twilio-settings-connected-row">
              <button className="btn-primary" disabled={!st.has_credentials || busy} onClick={connect} data-testid="twilio-settings-connect-btn">
                {busy && <Loader2 size={15} className="animate-spin" />}{st.connected ? "Reconnect" : "Connect"}
              </button>
            </Row>
            {st.webhook_base && <div className="text-xs text-slate-500 font-mono -mt-2 mb-2 pl-8 break-all" data-testid="twilio-settings-webhook">{st.webhook_base}/api/twilio/voice</div>}
            <Row ok={!!st.caller_id} label="Default caller ID (agents can switch it in the dialer)" testid="twilio-settings-caller-row">
              <select className="input !w-auto min-w-[240px]" disabled={!nums.length} value={st.caller_id || ""} onChange={(e) => pickCaller(e.target.value)} data-testid="twilio-settings-caller-select">
                <option value="" disabled>{nums.length ? "Choose a number" : "No numbers yet — add one below"}</option>
                {nums.map((n) => <option key={n.number} value={n.number}>{n.number} · {n.label && n.label !== n.number ? `${n.label} · ` : ""}{n.type}</option>)}
              </select>
            </Row>
            {st.has_credentials && <CallerVerify onRefresh={loadNums} />}
          </div>
        )}
      </section>
    </div>
  );
}

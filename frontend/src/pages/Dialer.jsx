import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, Pause, Play, Square } from "lucide-react";
import { errMsg, fmtDur, useApi } from "../lib/api";
import { useMe } from "../lib/me";
import { useTwilioDevice } from "../lib/useTwilioDevice";
import PageHeader from "../components/PageHeader";
import LiveDock from "../components/dialer/LiveDock";
import DispositionPanel from "../components/dialer/DispositionPanel";

const EMPTY = { outcome: "", notes: "", callbackAt: "" };
const SUGGEST = { "no-answer": "no_answer", busy: "busy" };

function Stat({ label, value, testid }) {
  return (
    <div className="card px-5 py-4">
      <div className="label !text-[10px]">{label}</div>
      <div className="font-mono text-2xl text-white mt-1" data-testid={testid}>{value}</div>
    </div>
  );
}

export default function Dialer() {
  const api = useApi();
  const me = useMe();
  const ensureDevice = useTwilioDevice(api);
  const [lists, setLists] = useState([]);
  const [listId, setListId] = useState("");
  const [auto, setAuto] = useState(true);
  const [tw, setTw] = useState(null);
  const [stats, setStats] = useState(null);
  const [phase, setPhase] = useState("idle");
  const [session, setSession] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [count, setCount] = useState(0);
  const callRef = useRef(null);
  const timerRef = useRef(null);
  const endedRef = useRef(false);

  const loadStats = useCallback(() => api.get("/stats").then((r) => setStats(r.data)).catch(() => {}), [api]);
  useEffect(() => {
    api.get("/lists").then((r) => { setLists(r.data); if (r.data[0]) setListId((v) => v || r.data[0].id); }).catch((e) => toast.error(errMsg(e)));
    api.get("/twilio/status").then((r) => setTw(r.data)).catch(() => {});
    loadStats();
  }, [api, loadStats]);

  useEffect(() => () => { clearInterval(timerRef.current); callRef.current?.disconnect(); api.post("/dialer/release").catch(() => {}); }, [api]);

  const endCall = useCallback(async (callId) => {
    if (endedRef.current) return;
    endedRef.current = true;
    clearInterval(timerRef.current);
    callRef.current = null;
    setMuted(false);
    setPhase("wrap");
    await new Promise((r) => setTimeout(r, 1500));
    const { data } = await api.get(`/calls/${callId}`).catch(() => ({ data: {} }));
    if (SUGGEST[data.status]) setForm((f) => (f.outcome ? f : { ...f, outcome: SUGGEST[data.status] }));
  }, [api]);

  const dialNext = useCallback(async () => {
    setPhase("connecting"); setForm(EMPTY); setSeconds(0); endedRef.current = false;
    try {
      const device = await ensureDevice();
      const { data } = await api.post("/dialer/next", { list_id: listId });
      if (data.done) { setSession(null); setPhase("done"); return; }
      setSession(data);
      const call = await device.connect({ params: { call_id: data.call.id } });
      callRef.current = call;
      setPhase("ringing");
      call.on("accept", () => {
        setPhase("live");
        const t0 = Date.now();
        timerRef.current = setInterval(() => setSeconds(Math.floor((Date.now() - t0) / 1000)), 500);
      });
      ["disconnect", "cancel", "reject"].forEach((ev) => call.on(ev, () => endCall(data.call.id)));
      call.on("error", (e) => { toast.error(e.message || "Call error"); endCall(data.call.id); });
    } catch (e) {
      toast.error(errMsg(e)); setPhase("idle");
    }
  }, [api, ensureDevice, endCall, listId]);

  useEffect(() => {
    if (phase !== "countdown") return;
    if (count <= 0) { dialNext(); return; }
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, count, dialNext]);

  const save = async () => {
    setSaving(true);
    try {
      const callback_at = form.callbackAt ? new Date(form.callbackAt).toISOString() : null;
      await api.post(`/calls/${session.call.id}/disposition`, { outcome: form.outcome, notes: form.notes, callback_at });
      toast.success("Outcome saved");
      loadStats();
      api.get("/lists").then((r) => setLists(r.data)).catch(() => {});
      if (auto) { setCount(3); setPhase("countdown"); } else { setSession(null); setPhase("idle"); setSeconds(0); }
    } catch (e) { toast.error(errMsg(e)); } finally { setSaving(false); }
  };

  const skip = async () => {
    await api.post(`/dialer/skip/${session.call.id}`).catch(() => {});
    if (auto) { setCount(1); setPhase("countdown"); } else { setSession(null); setPhase("idle"); }
  };

  const stop = () => {
    callRef.current?.disconnect();
    api.post("/dialer/release").catch(() => {});
    setSession(null); setPhase("idle"); setSeconds(0);
  };

  const list = lists.find((l) => l.id === listId);
  const remaining = list ? (list.stats.pending || 0) + (list.stats.callback || 0) : 0;
  const busy = ["connecting", "ringing", "live", "wrap", "countdown"].includes(phase);
  const notReady = tw && (!tw.connected || !tw.caller_id);

  return (
    <div data-testid="dialer-page">
      <PageHeader eyebrow={`Signed in as ${me.name}`} title="Power dialer" />
      {notReady && (
        <div className="card border-amber-500/30 bg-amber-500/[0.06] p-4 mb-6 flex items-start gap-3 text-amber-200 text-sm" data-testid="dialer-twilio-warning">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <div>Calling isn't set up yet. {me.role === "admin" ? <Link to="/settings" className="underline" data-testid="dialer-goto-settings">Connect Twilio and pick a caller ID in Settings.</Link> : "Ask your admin to connect Twilio in Settings."}</div>
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6 animate-rise" style={{ animationDelay: ".05s" }}>
        <Stat label="Calls today" value={stats?.calls_today ?? "—"} testid="stat-calls-today" />
        <Stat label="Connected" value={stats?.connected ?? "—"} testid="stat-connected" />
        <Stat label="Interested" value={stats?.interested ?? "—"} testid="stat-interested" />
        <Stat label="Talk time" value={stats ? fmtDur(stats.talk_seconds) : "—"} testid="stat-talk-time" />
      </div>
      <div className="card p-4 mb-6 flex flex-wrap items-center gap-3 animate-rise" style={{ animationDelay: ".1s" }}>
        <select className="input !w-auto min-w-[220px] flex-1 md:flex-none" value={listId} disabled={busy} onChange={(e) => setListId(e.target.value)} data-testid="dialer-list-select">
          {lists.length === 0 && <option value="">No lists yet</option>}
          {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        {list && <span className="text-sm text-slate-400" data-testid="dialer-remaining">{remaining} left of {list.total}</span>}
        <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="accent-indigo-500 h-4 w-4" data-testid="dialer-auto-advance-toggle" />
          Auto-dial next
        </label>
        <div className="ml-auto flex gap-2">
          {phase === "countdown" && <button className="btn-ghost" onClick={() => { setSession(null); setPhase("idle"); }} data-testid="dialer-pause-btn"><Pause size={16} />Pause ({count})</button>}
          {busy ? <button className="btn-ghost" onClick={stop} data-testid="dialer-stop-btn"><Square size={14} />Stop</button>
            : <button className="btn-success" disabled={!listId || notReady} onClick={dialNext} data-testid="dialer-start-btn"><Play size={16} />{phase === "done" ? "Check again" : "Start dialing"}</button>}
        </div>
        {lists.length === 0 && <Link to="/lists" className="text-sm text-accent underline w-full" data-testid="dialer-upload-link">Upload a contact list to get started</Link>}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-rise" style={{ animationDelay: ".15s" }}>
        <div className="lg:col-span-8">
          <LiveDock phase={phase} session={session} seconds={seconds} muted={muted} onSkip={skip}
            onMute={() => { const m = !muted; callRef.current?.mute(m); setMuted(m); }}
            onHangup={() => callRef.current?.disconnect()} onDigit={(d) => callRef.current?.sendDigits(d)} />
        </div>
        <div className="lg:col-span-4"><DispositionPanel phase={phase} form={form} setForm={setForm} onSave={save} saving={saving} /></div>
      </div>
    </div>
  );
}

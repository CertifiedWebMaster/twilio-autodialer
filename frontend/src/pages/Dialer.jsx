import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Pause, Play, Square } from "lucide-react";
import { toast } from "sonner";
import { errMsg, fmtDur, useApi } from "../lib/api";
import { useTwilioDevice } from "../lib/twilio";
import { useMe } from "../lib/me";
import LiveDock from "../components/LiveDock";
import DispositionPanel from "../components/DispositionPanel";
import TalkingPoints from "../components/TalkingPoints";
import Attachments from "../components/Attachments";

const EMPTY = { outcome: "", notes: "", callback_at: "" };
const SUGGEST = { "no-answer": "no_answer", busy: "busy" };

function Stat({ label, value, id }) {
  return (
    <div className="card px-5 py-4" data-testid={`stat-${id}`}>
      <div className="label">{label}</div>
      <div className="mt-1 font-display text-3xl font-bold text-white tabular-nums">{value}</div>
    </div>
  );
}

export default function Dialer() {
  const api = useApi();
  const me = useMe();
  const ensureDevice = useTwilioDevice(api);
  const [lists, setLists] = useState([]);
  const [listId, setListId] = useState("");
  const [tw, setTw] = useState(null);
  const [stats, setStats] = useState(null);
  const [phase, setPhase] = useState("idle");
  const [session, setSession] = useState(null);
  const [dispo, setDispo] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [auto, setAuto] = useState(true);
  const [countdown, setCountdown] = useState(null);
  const callRef = useRef(null);

  const loadStats = useCallback(() => api.get("/stats").then((r) => setStats(r.data)).catch(() => {}), [api]);
  useEffect(() => {
    api.get("/lists").then((r) => { setLists(r.data); if (r.data[0]) setListId((v) => v || r.data[0].id); });
    api.get("/twilio/status").then((r) => setTw(r.data));
    loadStats();
  }, [api, loadStats]);

  useEffect(() => {
    if (phase !== "live") return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => () => { callRef.current?.disconnect(); api.post("/dialer/release").catch(() => {}); }, [api]);

  const ended = useCallback((callId) => {
    callRef.current = null;
    setMuted(false);
    setPhase("wrap");
    setTimeout(() => api.get(`/calls/${callId}`).then((r) => {
      const s = SUGGEST[r.data.status];
      if (s) setDispo((d) => (d.outcome ? d : { ...d, outcome: s }));
      setSession((x) => (x && x.call.id === callId ? { ...x, call: r.data } : x));
    }).catch(() => {}), 1800);
  }, [api]);

  const next = useCallback(async () => {
    setCountdown(null);
    setPhase("connecting");
    setSeconds(0);
    setDispo(EMPTY);
    try {
      const { data } = await api.post("/dialer/next", { list_id: listId });
      if (data.done) { setSession(null); setPhase("done"); return; }
      setSession(data);
      const device = await ensureDevice();
      const call = await device.connect({ params: { call_id: data.call.id } });
      callRef.current = call;
      setPhase("ringing");
      call.on("accept", () => setPhase("live"));
      ["disconnect", "cancel", "reject"].forEach((ev) => call.on(ev, () => ended(data.call.id)));
      call.on("error", (e) => { toast.error(e.message || "Call failed"); ended(data.call.id); });
    } catch (e) {
      toast.error(errMsg(e));
      setPhase((p) => (p === "connecting" ? "idle" : p));
    }
  }, [api, listId, ensureDevice, ended]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) { next(); return; }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, next]);

  const afterWrap = () => {
    loadStats();
    api.get("/lists").then((r) => setLists(r.data));
    if (auto) setCountdown(3);
    else { setSession(null); setPhase("idle"); }
  };

  const save = async () => {
    setSaving(true);
    try {
      const body = { ...dispo, callback_at: dispo.outcome === "callback" && dispo.callback_at ? new Date(dispo.callback_at).toISOString() : null };
      await api.post(`/calls/${session.call.id}/disposition`, body);
      toast.success("Outcome saved");
      afterWrap();
    } catch (e) { toast.error(errMsg(e)); }
    setSaving(false);
  };

  const skip = async () => {
    try { await api.post(`/dialer/skip/${session.call.id}`); afterWrap(); } catch (e) { toast.error(errMsg(e)); }
  };

  const stop = async () => {
    setCountdown(null);
    callRef.current?.disconnect();
    if (phase !== "wrap") { await api.post("/dialer/release").catch(() => {}); setSession(null); setPhase("idle"); }
  };

  const list = lists.find((l) => l.id === listId);
  const remaining = list ? list.stats.pending + list.stats.callback : 0;
  const busy = ["connecting", "ringing", "live"].includes(phase);
  const ready = tw?.connected && tw?.caller_id;

  return (
    <div className="space-y-6" data-testid="dialer-page">
      <div className="animate-rise">
        <div className="label mb-2">Power dialer</div>
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-white">Hi {me.name?.split(" ")[0]}, let's dial.</h1>
      </div>

      {tw && !ready && (
        <div className="card !border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-3 text-sm text-amber-200" data-testid="twilio-not-ready-banner">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <div>{!tw.connected ? "Calling isn't set up yet — Twilio isn't connected." : "No caller ID selected yet."}{" "}
            {me.role === "admin" ? <Link to="/settings" className="underline">Finish setup in Settings</Link> : "Ask an admin to finish setup in Settings."}
          </div>
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="dialer-stats">
          <Stat id="calls-today" label="Calls today" value={stats.calls_today} />
          <Stat id="connected" label="Connected" value={stats.connected} />
          <Stat id="interested" label="Interested" value={stats.interested} />
          <Stat id="talk-time" label="Talk time" value={fmtDur(stats.talk_seconds)} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 flex flex-col gap-6">
          <div className="card p-4 flex flex-wrap items-center gap-3" data-testid="dialer-controls">
            <select className="input !w-auto flex-1 min-w-[200px]" value={listId} onChange={(e) => setListId(e.target.value)} disabled={busy || phase === "wrap"} data-testid="dialer-list-select">
              {lists.length === 0 && <option value="">No lists yet</option>}
              {lists.map((l) => <option key={l.id} value={l.id}>{l.name} · {l.stats.pending + l.stats.callback} left</option>)}
            </select>
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none">
              <input type="checkbox" className="accent-indigo-500 h-4 w-4" checked={auto} onChange={(e) => setAuto(e.target.checked)} data-testid="dialer-auto-advance-toggle" />
              Auto-dial next
            </label>
            {phase === "idle" || phase === "done" ? (
              <button className="btn-success disabled:!bg-white/10 disabled:!text-slate-400" disabled={!ready || !listId || remaining === 0} onClick={next} data-testid="dialer-start-btn"><Play size={16} />Start dialing</button>
            ) : (
              <button className="btn-ghost" onClick={stop} data-testid="dialer-stop-btn"><Square size={14} />Stop</button>
            )}
            {lists.length === 0 && <Link to="/lists" className="text-sm text-accent underline" data-testid="dialer-upload-link">Upload a CSV list</Link>}
          </div>

          {countdown !== null && (
            <div className="card !border-accent/40 bg-accent/10 p-4 flex flex-wrap gap-3 items-center justify-between animate-rise" data-testid="dialer-countdown-banner">
              <span className="text-sm text-white">Dialing next contact in <b className="font-mono">{countdown}</b>…</span>
              <div className="flex gap-2">
                <button className="btn-ghost !py-1.5" onClick={() => { setCountdown(null); setSession(null); setPhase("idle"); }} data-testid="dialer-countdown-pause-btn"><Pause size={14} />Pause</button>
                <button className="btn-primary !py-1.5" onClick={next} data-testid="dialer-countdown-now-btn">Dial now</button>
              </div>
            </div>
          )}

          <LiveDock phase={phase} contact={session?.contact} seconds={seconds} muted={muted}
            onMute={() => { callRef.current?.mute(!muted); setMuted(!muted); }}
            onHangup={() => callRef.current?.disconnect()} onDigit={(d) => callRef.current?.sendDigits(d)} />

          {session?.contact && (
            <div className="grid md:grid-cols-2 gap-6">
              <div className="card p-5" data-testid="dialer-contact-details">
                <div className="label mb-3">Contact details</div>
                <dl className="space-y-2 text-sm">
                  {Object.entries(session.contact.extra || {}).map(([k, v]) => (
                    <div key={k} className="flex gap-3"><dt className="text-slate-500 w-28 shrink-0 truncate">{k}</dt><dd className="text-slate-200 break-words min-w-0">{v}</dd></div>
                  ))}
                  <div className="flex gap-3"><dt className="text-slate-500 w-28 shrink-0">Attempts</dt><dd className="font-mono">{session.contact.attempts}</dd></div>
                  {session.contact.notes && <div className="flex gap-3"><dt className="text-slate-500 w-28 shrink-0">Last notes</dt><dd className="text-slate-300">{session.contact.notes}</dd></div>}
                </dl>
                <div className="mt-5 pt-5 border-t border-white/[0.06]"><Attachments contactId={session.contact.id} callId={session.call.id} /></div>
              </div>
              <div className="card p-5"><TalkingPoints contact={session.contact} /></div>
            </div>
          )}
        </div>

        <div className="lg:col-span-4">
          <div className="lg:sticky lg:top-8">
            <DispositionPanel callId={session?.call?.id} value={dispo} onChange={setDispo} canSave={phase === "wrap" && countdown === null}
              saving={saving} onSave={save} onSkip={skip} />
          </div>
        </div>
      </div>
    </div>
  );
}

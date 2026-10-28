import { Grid3x3, Mic, MicOff, PhoneOff, Phone, SkipForward, User } from "lucide-react";
import { useState } from "react";
import { fmtDur } from "../../lib/api";

const PHASE = {
  idle: { label: "Ready", cls: "text-slate-300 bg-white/5 border-white/10" },
  connecting: { label: "Connecting", cls: "text-amber-300 bg-amber-500/10 border-amber-500/30" },
  ringing: { label: "Ringing", cls: "text-amber-300 bg-amber-500/10 border-amber-500/30" },
  live: { label: "In call", cls: "text-emerald-300 bg-emerald-500/10 border-emerald-500/40" },
  wrap: { label: "Wrap-up", cls: "text-sky-300 bg-sky-500/10 border-sky-500/30" },
  countdown: { label: "Next call soon", cls: "text-accent bg-accent/10 border-accent/40" },
  done: { label: "List complete", cls: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30" },
};

function Wave({ active }) {
  return (
    <div className="flex items-end gap-1 h-8" aria-hidden>
      {Array.from({ length: 14 }).map((_, i) => (
        <span key={i} className={`w-1 rounded-full h-full origin-bottom ${active ? "bg-emerald-400 animate-wave" : "bg-white/10 scale-y-[0.2]"}`}
          style={{ animationDelay: `${(i % 7) * 0.09}s` }} />
      ))}
    </div>
  );
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

export default function LiveDock({ phase, session, seconds, muted, onMute, onHangup, onDigit, onSkip }) {
  const [pad, setPad] = useState(false);
  const p = PHASE[phase] || PHASE.idle;
  const c = session?.contact;
  const onCall = phase === "ringing" || phase === "live";
  return (
    <section className={`card p-6 md:p-8 relative overflow-hidden transition-[border-color] ${phase === "live" ? "border-emerald-500/40" : ""}`} data-testid="dialer-dock">
      {phase === "live" && <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />}
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${p.cls}`} data-testid="dialer-dock-status">
          {onCall && <span className="h-2 w-2 rounded-full bg-current animate-pulse" />}{p.label}
        </span>
        <span className="font-mono text-3xl md:text-4xl text-white tabular-nums" data-testid="dialer-dock-timer">{fmtDur(seconds)}</span>
      </div>
      <div className="relative mt-8 flex items-center gap-5">
        <div className="grid place-items-center h-16 w-16 shrink-0 rounded-2xl bg-elevated text-slate-400"><User size={28} /></div>
        <div className="min-w-0">
          <div className="font-display text-2xl md:text-3xl font-bold text-white truncate" data-testid="dialer-dock-contact-name">{c ? c.name || "Unnamed contact" : "No contact loaded"}</div>
          <div className="font-mono text-slate-400 mt-1" data-testid="dialer-dock-contact-phone">{c?.phone || "Pick a list and start dialing"}</div>
        </div>
      </div>
      {c?.extra && Object.keys(c.extra).length > 0 && (
        <dl className="relative mt-6 grid grid-cols-2 md:grid-cols-3 gap-3" data-testid="dialer-dock-contact-extra">
          {Object.entries(c.extra).slice(0, 6).map(([k, v]) => (
            <div key={k} className="rounded-xl bg-ink/60 border border-white/[0.06] px-3 py-2"><dt className="label !text-[10px]">{k}</dt><dd className="text-sm text-slate-200 truncate">{v}</dd></div>
          ))}
        </dl>
      )}
      <div className="relative mt-8 flex flex-wrap items-center gap-3">
        <Wave active={phase === "live" && !muted} />
        <div className="ml-auto flex flex-wrap gap-2">
          <button className="btn-ghost" disabled={phase !== "live"} onClick={onMute} data-testid="dialer-dock-mute-btn">{muted ? <MicOff size={16} /> : <Mic size={16} />}{muted ? "Unmute" : "Mute"}</button>
          <button className="btn-ghost" disabled={phase !== "live"} onClick={() => setPad((v) => !v)} data-testid="dialer-dock-keypad-btn"><Grid3x3 size={16} />Keypad</button>
          {phase === "wrap" && <button className="btn-ghost" onClick={onSkip} data-testid="dialer-dock-skip-btn"><SkipForward size={16} />Skip</button>}
          <button className="btn-danger" disabled={!onCall} onClick={onHangup} data-testid="dialer-dock-hangup-btn"><PhoneOff size={16} />Hang up</button>
        </div>
      </div>
      {pad && phase === "live" && (
        <div className="relative mt-5 grid grid-cols-3 gap-2 max-w-xs ml-auto" data-testid="dialer-keypad">
          {KEYS.map((k) => (
            <button key={k} className="btn-ghost !rounded-xl font-mono text-lg" onClick={() => onDigit(k)} data-testid={`dialer-keypad-${k === "*" ? "star" : k === "#" ? "hash" : k}`}>{k}</button>
          ))}
        </div>
      )}
      {!c && phase === "idle" && <Phone className="absolute right-8 bottom-8 text-white/[0.03]" size={140} />}
    </section>
  );
}

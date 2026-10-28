import { Grid3x3, Mic, MicOff, PhoneOff } from "lucide-react";
import { useState } from "react";
import { fmtDur } from "../lib/api";

const PHASE = {
  idle: { label: "Idle", cls: "text-slate-300 bg-white/5 border-white/10" },
  connecting: { label: "Connecting", cls: "text-amber-300 bg-amber-500/10 border-amber-500/30" },
  ringing: { label: "Ringing", cls: "text-amber-300 bg-amber-500/10 border-amber-500/30 animate-pulse" },
  live: { label: "In call", cls: "text-emerald-300 bg-emerald-500/10 border-emerald-500/40" },
  wrap: { label: "Call ended", cls: "text-rose-300 bg-rose-500/10 border-rose-500/30" },
  done: { label: "List complete", cls: "text-sky-300 bg-sky-500/10 border-sky-500/30" },
};

function Wave({ on }) {
  return (
    <div className="flex items-end gap-1 h-8" aria-hidden>
      {Array.from({ length: 14 }).map((_, i) => (
        <span key={i} className={`w-1 rounded-full h-full origin-bottom ${on ? "bg-emerald-400 animate-wave" : "bg-white/10 scale-y-[.25]"}`} style={{ animationDelay: `${(i % 7) * 0.09}s` }} />
      ))}
    </div>
  );
}

export default function LiveDock({ phase, contact, seconds, muted, onMute, onHangup, onDigit }) {
  const [pad, setPad] = useState(false);
  const p = PHASE[phase] || PHASE.idle;
  const active = phase === "ringing" || phase === "live";
  return (
    <div className={`card p-6 md:p-8 relative overflow-hidden transition-[border-color] ${phase === "live" ? "!border-emerald-500/40" : ""}`} data-testid="dialer-dock">
      <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-accent/10 blur-3xl pointer-events-none" />
      <div className="flex flex-wrap items-start justify-between gap-4 relative">
        <div className="min-w-0">
          <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${p.cls}`} data-testid="dialer-dock-status">{p.label}</span>
          <h2 className="mt-4 font-display text-3xl md:text-4xl font-extrabold tracking-tight text-white truncate" data-testid="dialer-dock-contact-name">
            {contact ? contact.name || "Unnamed contact" : phase === "done" ? "Nothing left to dial" : "Ready when you are"}
          </h2>
          <p className="mt-1 font-mono text-lg text-slate-400" data-testid="dialer-dock-contact-phone">{contact?.phone || "Pick a list and press Start"}</p>
        </div>
        <div className="text-right">
          <div className="font-mono text-4xl font-semibold text-white tabular-nums" data-testid="dialer-dock-timer">{fmtDur(seconds)}</div>
          <div className="mt-2 flex justify-end"><Wave on={phase === "live" && !muted} /></div>
        </div>
      </div>
      <div className="mt-8 flex flex-wrap items-center gap-3 relative">
        <button className="btn-ghost" disabled={phase !== "live"} onClick={onMute} data-testid="dialer-dock-mute-btn">
          {muted ? <MicOff size={16} /> : <Mic size={16} />}{muted ? "Unmute" : "Mute"}
        </button>
        <button className="btn-ghost" disabled={phase !== "live"} onClick={() => setPad((v) => !v)} data-testid="dialer-dock-keypad-btn"><Grid3x3 size={16} />Keypad</button>
        <button className="btn-danger" disabled={!active} onClick={onHangup} data-testid="dialer-dock-hangup-btn"><PhoneOff size={16} />Hang up</button>
      </div>
      {pad && phase === "live" && (
        <div className="mt-5 grid grid-cols-3 gap-2 max-w-[220px]" data-testid="dialer-keypad">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map((d) => (
            <button key={d} className="btn-ghost !rounded-xl font-mono" onClick={() => onDigit(d)} data-testid={`dialer-keypad-${d === "*" ? "star" : d === "#" ? "hash" : d}`}>{d}</button>
          ))}
        </div>
      )}
    </div>
  );
}

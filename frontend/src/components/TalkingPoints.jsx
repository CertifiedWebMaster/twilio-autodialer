import { useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { streamAI } from "../lib/twilio";

export default function TalkingPoints({ contact }) {
  const { getToken } = useAuth();
  const [text, setText] = useState(contact?.talking_points || "");
  const [busy, setBusy] = useState(false);
  useEffect(() => setText(contact?.talking_points || ""), [contact?.id, contact?.talking_points]);

  const run = async () => {
    setBusy(true);
    setText("");
    try { await streamAI(`/ai/talking-points/${contact.id}`, null, await getToken(), (t) => setText((s) => s + t)); }
    catch (e) { toast.error(e.message); }
    setBusy(false);
  };

  return (
    <div data-testid="talking-points-panel">
      <div className="flex items-center justify-between mb-3">
        <span className="label flex items-center gap-2"><Sparkles size={13} className="text-accent" /> Talking points</span>
        <button className="btn-ghost !py-1 !px-3 text-xs" onClick={run} disabled={busy} data-testid="talking-points-generate-btn">
          {busy ? "Writing…" : text ? "Refresh" : "Generate"}
        </button>
      </div>
      {text ? (
        <p className="whitespace-pre-wrap text-sm text-slate-300 leading-relaxed" data-testid="talking-points-text">{text}</p>
      ) : (
        <p className="text-xs text-slate-500">Get an AI opener and three talking points for this contact.</p>
      )}
    </div>
  );
}

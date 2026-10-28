import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { errMsg, useApi } from "../lib/api";

export default function AiSettings() {
  const api = useApi();
  const [st, setSt] = useState(null);
  useEffect(() => { api.get("/ai/settings").then((r) => setSt(r.data)).catch((e) => toast.error(errMsg(e))); }, [api]);

  const pick = async (provider) => {
    if (provider === st.provider) return;
    try { const r = await api.patch("/ai/settings", { provider }); setSt(r.data); toast.success(`AI now runs on ${r.data.options.find((o) => o.key === provider).label}`); }
    catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <section className="card p-6 max-w-3xl mt-6" data-testid="ai-settings-card">
      <div className="flex items-center gap-3 mb-2">
        <Sparkles className="text-accent" size={20} />
        <h2 className="font-display text-xl font-bold text-white">AI assistant</h2>
      </div>
      <p className="text-sm text-slate-400 mb-5">Choose which AI writes talking points, tidies notes and picks call outcomes for the whole team.</p>
      {st && (
        <div className="grid sm:grid-cols-2 gap-3">
          {st.options.map((o) => {
            const on = st.provider === o.key;
            return (
              <button key={o.key} onClick={() => pick(o.key)} data-testid={`ai-provider-${o.key}`}
                className={`rounded-xl border px-4 py-4 text-left transition-[background-color,border-color,transform] active:scale-[.98] ${on ? "border-accent/60 bg-accent/10" : "border-white/10 hover:bg-white/5"}`}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">{o.label}</span>
                  <span className={`h-4 w-4 rounded-full border-2 ${on ? "border-accent bg-accent" : "border-white/20"}`} />
                </div>
                <div className="text-xs text-slate-400 mt-1">{o.key === "openai" ? "OpenAI's reasoning model" : "Google's most advanced model — slower, most thorough"}</div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

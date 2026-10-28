import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { OUTCOMES, errMsg, fmtDate, fmtDur, useApi } from "../lib/api";
import { useMe } from "../lib/me";
import PageHeader from "../components/PageHeader";
import { OutcomeBadge } from "../components/Badges";

const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

function exportCsv(calls) {
  const head = ["Date", "Agent", "Contact", "Phone", "List", "Status", "Duration (s)", "Outcome", "Notes", "Callback"];
  const rows = calls.map((c) => [c.created_at, c.agent_name, c.contact_name, c.to, c.list_name, c.status, c.duration, c.outcome, c.notes, c.callback_at]);
  const blob = new Blob([[head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n")], { type: "text/csv" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "call-history.csv" });
  a.click();
}

export default function Calls() {
  const api = useApi();
  const me = useMe();
  const [calls, setCalls] = useState([]);
  const [agents, setAgents] = useState([]);
  const [agent, setAgent] = useState("");
  const [outcome, setOutcome] = useState("");
  const [open, setOpen] = useState(null);
  const admin = me.role === "admin";

  useEffect(() => { if (admin) api.get("/users").then((r) => setAgents(r.data.users)).catch(() => {}); }, [api, admin]);
  useEffect(() => {
    const params = { ...(agent && { agent_id: agent }), ...(outcome && { outcome }) };
    api.get("/calls", { params }).then((r) => setCalls(r.data)).catch((e) => toast.error(errMsg(e)));
  }, [api, agent, outcome]);

  return (
    <div data-testid="call-history-page">
      <PageHeader eyebrow={admin ? "Whole team" : "Your calls"} title="Call history">
        <button className="btn-ghost" disabled={!calls.length} onClick={() => exportCsv(calls)} data-testid="call-history-export-btn"><Download size={15} />Export CSV</button>
      </PageHeader>
      <div className="flex flex-wrap gap-3 mb-4">
        {admin && (
          <select className="input !w-auto" value={agent} onChange={(e) => setAgent(e.target.value)} data-testid="call-history-agent-filter">
            <option value="">All agents</option>
            {agents.map((u) => <option key={u.user_id} value={u.user_id}>{u.name}</option>)}
          </select>
        )}
        <select className="input !w-auto" value={outcome} onChange={(e) => setOutcome(e.target.value)} data-testid="call-history-outcome-filter">
          <option value="">All outcomes</option>
          {OUTCOMES.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[820px]">
          <thead><tr><th className="th">When</th>{admin && <th className="th">Agent</th>}<th className="th">Contact</th><th className="th">List</th><th className="th">Status</th><th className="th">Duration</th><th className="th">Outcome</th><th className="th">Notes</th></tr></thead>
          <tbody>
            {calls.length === 0 && <tr><td className="td text-slate-500" colSpan={8} data-testid="call-history-empty">No calls yet.</td></tr>}
            {calls.map((c) => (
              <tr key={c.id} onClick={() => setOpen(open === c.id ? null : c.id)} className="hover:bg-white/[0.02] cursor-pointer align-top" data-testid={`call-row-${c.id}`}>
                <td className="td text-slate-400 whitespace-nowrap">{fmtDate(c.created_at)}</td>
                {admin && <td className="td">{c.agent_name}</td>}
                <td className="td"><div className="text-white">{c.contact_name || "—"}</div><div className="font-mono text-xs text-slate-500">{c.to}</div></td>
                <td className="td text-slate-400">{c.list_name}</td>
                <td className="td text-slate-400 capitalize">{String(c.status).replace("-", " ")}</td>
                <td className="td font-mono">{fmtDur(c.duration)}</td>
                <td className="td"><OutcomeBadge outcome={c.outcome} />{c.callback_at && <div className="text-xs text-sky-300 mt-1">{fmtDate(c.callback_at)}</div>}</td>
                <td className={`td text-slate-400 max-w-[280px] ${open === c.id ? "whitespace-pre-wrap" : "truncate"}`}>{c.notes || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

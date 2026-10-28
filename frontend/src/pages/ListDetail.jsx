import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { errMsg, fmtDate, useApi } from "../lib/api";
import { useMe } from "../lib/me";
import PageHeader from "../components/PageHeader";
import { OutcomeBadge, Progress, StatusBadge } from "../components/Badges";

const FILTERS = ["", "pending", "callback", "in_progress", "completed"];

export default function ListDetail() {
  const { id } = useParams();
  const api = useApi();
  const me = useMe();
  const [list, setList] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [filter, setFilter] = useState("");
  const load = useCallback(() => {
    api.get(`/lists/${id}`).then((r) => setList(r.data)).catch((e) => toast.error(errMsg(e)));
    api.get(`/lists/${id}/contacts`, { params: filter ? { status: filter } : {} }).then((r) => setContacts(r.data)).catch(() => {});
  }, [api, id, filter]);
  useEffect(() => { load(); }, [load]);
  const requeue = async () => {
    try { const { data } = await api.post(`/lists/${id}/requeue`); toast.success(`${data.requeued} contacts back in the queue`); load(); }
    catch (e) { toast.error(errMsg(e)); }
  };
  if (!list) return <div className="text-slate-500">Loading…</div>;
  return (
    <div data-testid="list-detail-page">
      <Link to="/lists" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white mb-4" data-testid="list-detail-back"><ArrowLeft size={14} />All lists</Link>
      <PageHeader eyebrow={`${list.total} contacts`} title={list.name}>
        {me.role === "admin" && <button className="btn-ghost" onClick={requeue} data-testid="list-detail-requeue-btn"><RotateCcw size={15} />Re-dial no answer / busy / voicemail</button>}
      </PageHeader>
      <div className="card p-5 mb-6 flex flex-wrap items-center gap-6">
        <div className="flex-1 min-w-[200px]"><Progress stats={list.stats} total={list.total} /></div>
        {Object.entries(list.stats).map(([k, v]) => <div key={k} className="text-sm"><span className="label !text-[10px] mr-2">{k.replace("_", " ")}</span><span className="font-mono text-white">{v}</span></div>)}
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        {FILTERS.map((f) => (
          <button key={f || "all"} onClick={() => setFilter(f)} data-testid={`list-detail-filter-${f || "all"}`}
            className={`btn !px-3 !py-1.5 border ${filter === f ? "bg-accent/15 border-accent/40 text-white" : "border-white/10 text-slate-400 hover:text-white"}`}>{f ? f.replace("_", " ") : "All"}</button>
        ))}
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead><tr><th className="th">Name</th><th className="th">Phone</th><th className="th">Status</th><th className="th">Outcome</th><th className="th">Notes</th><th className="th">Callback</th><th className="th">Tries</th></tr></thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.id} className="hover:bg-white/[0.02]" data-testid={`contact-row-${c.id}`}>
                <td className="td text-white">{c.name || "—"}</td>
                <td className="td font-mono text-slate-300">{c.phone}</td>
                <td className="td"><StatusBadge status={c.status} /></td>
                <td className="td"><OutcomeBadge outcome={c.outcome} /></td>
                <td className="td text-slate-400 max-w-[260px] truncate" title={c.notes}>{c.notes || "—"}</td>
                <td className="td text-slate-400">{c.callback_at ? fmtDate(c.callback_at) : "—"}</td>
                <td className="td font-mono">{c.attempts}</td>
              </tr>
            ))}
            {contacts.length === 0 && <tr><td className="td text-slate-500" colSpan={7}>No contacts in this view.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

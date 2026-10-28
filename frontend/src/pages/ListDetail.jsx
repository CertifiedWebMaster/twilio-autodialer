import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, X } from "lucide-react";
import { errMsg, fmtDate, useApi } from "../lib/api";
import PageHeader from "../components/PageHeader";
import { OutcomeBadge, Progress, StatusBadge } from "../components/Badges";
import Attachments from "../components/Attachments";
import TalkingPoints from "../components/TalkingPoints";

const TABS = [["", "All"], ["pending", "Pending"], ["callback", "Callback"], ["in_progress", "In progress"], ["completed", "Completed"]];

function ContactDrawer({ contact, onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <aside className="absolute right-0 inset-y-0 w-full max-w-md bg-surface border-l border-white/10 p-6 overflow-y-auto space-y-6" onClick={(e) => e.stopPropagation()} data-testid="contact-drawer">
        <div className="flex items-start justify-between">
          <div><h3 className="font-display text-2xl font-bold text-white">{contact.name || "Unnamed contact"}</h3><p className="font-mono text-slate-400">{contact.phone}</p></div>
          <button onClick={onClose} className="text-slate-400 hover:text-white" data-testid="contact-drawer-close-btn"><X size={18} /></button>
        </div>
        <div className="flex gap-2"><StatusBadge status={contact.status} /><OutcomeBadge outcome={contact.outcome} /></div>
        <dl className="space-y-2 text-sm">
          {Object.entries(contact.extra || {}).map(([k, v]) => <div key={k} className="flex gap-3"><dt className="text-slate-500 w-28 shrink-0 truncate">{k}</dt><dd className="break-words min-w-0">{v}</dd></div>)}
          {contact.callback_at && <div className="flex gap-3"><dt className="text-slate-500 w-28">Callback</dt><dd>{fmtDate(contact.callback_at)}</dd></div>}
          {contact.notes && <div className="flex gap-3"><dt className="text-slate-500 w-28 shrink-0">Notes</dt><dd className="whitespace-pre-wrap">{contact.notes}</dd></div>}
        </dl>
        <div className="border-t border-white/[0.06] pt-5"><TalkingPoints contact={contact} /></div>
        <div className="border-t border-white/[0.06] pt-5"><Attachments contactId={contact.id} /></div>
      </aside>
    </div>
  );
}

export default function ListDetail() {
  const { id } = useParams();
  const api = useApi();
  const [list, setList] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [tab, setTab] = useState("");
  const [open, setOpen] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => { api.get(`/lists/${id}`).then((r) => setList(r.data)).catch((e) => setError(errMsg(e))); }, [api, id]);
  useEffect(() => { api.get(`/lists/${id}/contacts`, { params: tab ? { status: tab } : {} }).then((r) => setContacts(r.data)).catch(() => {}); }, [api, id, tab]);

  if (error) return (
    <div data-testid="list-detail-error">
      <p className="text-rose-300 mb-4">{error}</p>
      <Link to="/lists" className="btn-ghost">Back to lists</Link>
    </div>
  );
  if (!list) return <p className="text-slate-500">Loading…</p>;
  return (
    <div data-testid="list-detail-page">
      <Link to="/lists" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white mb-4" data-testid="list-detail-back-link"><ArrowLeft size={14} />All lists</Link>
      <PageHeader eyebrow={`${list.total} contacts`} title={list.name}><div className="w-56"><Progress stats={list.stats} total={list.total} /></div></PageHeader>
      <div className="flex flex-wrap gap-2 mb-4">
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} data-testid={`list-detail-tab-${k || "all"}`}
            className={`rounded-full px-4 py-1.5 text-sm border transition-colors ${tab === k ? "bg-accent/15 border-accent/40 text-white" : "border-white/10 text-slate-400 hover:text-white"}`}>
            {label}{k && list.stats[k] !== undefined ? ` · ${list.stats[k]}` : ""}
          </button>
        ))}
      </div>
      <div className="card overflow-x-auto" data-testid="list-detail-contacts-table">
        <table className="w-full min-w-[720px]">
          <thead><tr><th className="th">Name</th><th className="th">Phone</th><th className="th">Status</th><th className="th">Outcome</th><th className="th">Attempts</th><th className="th">Notes</th></tr></thead>
          <tbody>
            {contacts.length === 0 && <tr><td className="td text-slate-500" colSpan={6}>No contacts here.</td></tr>}
            {contacts.map((c) => (
              <tr key={c.id} onClick={() => setOpen(c)} className="hover:bg-white/[0.03] cursor-pointer" data-testid={`contact-row-${c.id}`}>
                <td className="td text-white">{c.name || "—"}</td>
                <td className="td font-mono text-slate-300">{c.phone}</td>
                <td className="td"><StatusBadge status={c.status} /></td>
                <td className="td"><OutcomeBadge outcome={c.outcome} /></td>
                <td className="td font-mono">{c.attempts}</td>
                <td className="td text-slate-400 max-w-[260px] truncate">{c.notes || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && <ContactDrawer contact={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

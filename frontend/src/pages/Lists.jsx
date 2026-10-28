import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { FileUp, Loader2, Trash2, UserPlus } from "lucide-react";
import { errMsg, fmtDate, useApi } from "../lib/api";
import { useMe } from "../lib/me";
import PageHeader from "../components/PageHeader";
import { Progress } from "../components/Badges";
import AssignModal from "../components/AssignModal";

function Uploader({ onDone }) {
  const api = useApi();
  const [name, setName] = useState("");
  const [file, setFile] = useState(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  const pick = (f) => { if (f) { setFile(f); if (!name) setName(f.name.replace(/\.csv$/i, "")); } };
  const submit = async (e) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append("name", name); fd.append("file", file);
    setBusy(true);
    try {
      const { data } = await api.post("/lists", fd);
      toast.success(`Imported ${data.imported} contacts`, { description: `${data.invalid} invalid · ${data.duplicates} duplicates · ${data.do_not_call} on do-not-call` });
      setFile(null); setName(""); onDone();
    } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="card p-6 grid md:grid-cols-[1fr_auto] gap-4 mb-8 animate-rise" data-testid="contact-lists-upload-form">
      <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }} onClick={() => input.current.click()}
        className={`cursor-pointer rounded-xl border border-dashed px-5 py-6 flex items-center gap-4 transition-colors ${drag ? "border-accent bg-accent/10" : "border-white/15 hover:border-white/30"}`} data-testid="contact-lists-dropzone">
        <FileUp className="text-accent shrink-0" />
        <div className="min-w-0">
          <div className="text-sm text-white truncate" data-testid="contact-lists-file-name">{file ? file.name : "Drop a CSV here or click to choose"}</div>
          <div className="text-xs text-slate-500 mt-1">Needs a <span className="font-mono">phone</span> column. Optional: name, company, email… 10-digit numbers get +1.</div>
        </div>
        <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => pick(e.target.files[0])} data-testid="contact-lists-file-input" />
      </div>
      <div className="flex flex-col sm:flex-row md:flex-col gap-3 md:w-64">
        <input className="input" placeholder="List name" value={name} onChange={(e) => setName(e.target.value)} required data-testid="contact-lists-name-input" />
        <button className="btn-primary" disabled={!file || busy} data-testid="contact-lists-upload-btn">{busy ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />}Upload list</button>
      </div>
    </form>
  );
}

export default function Lists() {
  const api = useApi();
  const me = useMe();
  const [lists, setLists] = useState(null);
  const [assign, setAssign] = useState(null);
  const load = useCallback(() => api.get("/lists").then((r) => setLists(r.data)).catch((e) => toast.error(errMsg(e))), [api]);
  useEffect(() => { load(); }, [load]);
  const remove = async (l) => {
    if (!window.confirm(`Delete "${l.name}" and its ${l.total} contacts?`)) return;
    try { await api.delete(`/lists/${l.id}`); toast.success("List deleted"); load(); } catch (e) { toast.error(errMsg(e)); }
  };
  const admin = me.role === "admin";
  return (
    <div data-testid="contact-lists-page">
      <PageHeader eyebrow="Contacts" title="Contact lists" />
      <Uploader onDone={load} />
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead><tr><th className="th">List</th><th className="th">Progress</th><th className="th">Left</th><th className="th">Callbacks</th><th className="th">Agents</th><th className="th">Created</th><th className="th" /></tr></thead>
          <tbody>
            {lists?.length === 0 && <tr><td className="td text-slate-500" colSpan={7} data-testid="contact-lists-empty">No lists yet — upload your first CSV above.</td></tr>}
            {lists?.map((l) => (
              <tr key={l.id} className="hover:bg-white/[0.02]" data-testid={`contact-list-row-${l.id}`}>
                <td className="td"><Link to={`/lists/${l.id}`} className="text-white font-medium hover:text-accent" data-testid={`contact-list-link-${l.id}`}>{l.name}</Link><div className="text-xs text-slate-500">{l.total} contacts</div></td>
                <td className="td"><Progress stats={l.stats} total={l.total} /></td>
                <td className="td font-mono">{l.stats.pending}</td>
                <td className="td font-mono">{l.stats.callback}</td>
                <td className="td font-mono">{l.assigned_to.length}</td>
                <td className="td text-slate-400">{fmtDate(l.created_at)}</td>
                <td className="td text-right whitespace-nowrap">
                  {admin && <button className="btn-ghost !px-3 !py-1.5" onClick={() => setAssign(l)} data-testid={`contact-list-assign-btn-${l.id}`}><UserPlus size={14} />Assign</button>}
                  {admin && <button className="btn-ghost !px-3 !py-1.5 ml-2 hover:!border-rose-500/50" onClick={() => remove(l)} data-testid={`contact-list-delete-btn-${l.id}`}><Trash2 size={14} /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {assign && <AssignModal list={assign} onClose={() => setAssign(null)} onSaved={() => { setAssign(null); load(); }} />}
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Download, FileUp, RotateCcw, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { errMsg, fmtDate, useApi } from "../lib/api";
import { downloadBlob } from "../lib/twilio";
import { useMe } from "../lib/me";
import PageHeader from "../components/PageHeader";
import { Progress } from "../components/Badges";
import AssignModal from "../components/AssignModal";

function Uploader({ onDone }) {
  const api = useApi();
  const input = useRef(null);
  const [name, setName] = useState("");
  const [file, setFile] = useState(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const fd = new FormData();
    fd.append("name", name || file.name.replace(/\.csv$/i, ""));
    fd.append("file", file);
    setBusy(true);
    try {
      const { data } = await api.post("/lists", fd);
      toast.success(`Imported ${data.imported} contacts`, { description: `${data.invalid} invalid · ${data.duplicates} duplicates · ${data.do_not_call} on do-not-call` });
      setName(""); setFile(null); input.current.value = "";
      onDone();
    } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };

  return (
    <div className="card p-5 md:p-6 mb-8 animate-rise" data-testid="contact-lists-uploader">
      <div className="grid md:grid-cols-[1fr_2fr_auto] gap-4 items-end">
        <label className="block"><span className="label">List name</span>
          <input className="input mt-2" placeholder="e.g. June solar leads" value={name} onChange={(e) => setName(e.target.value)} data-testid="contact-lists-name-input" />
        </label>
        <div onClick={() => input.current.click()} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); setFile(e.dataTransfer.files[0]); }} data-testid="contact-lists-dropzone"
          className={`cursor-pointer rounded-xl border border-dashed px-4 py-3 flex items-center gap-3 text-sm transition-colors ${drag ? "border-accent bg-accent/10" : "border-white/15 hover:border-white/30"}`}>
          <FileUp size={18} className="text-accent shrink-0" />
          <span className="truncate text-slate-300">{file ? file.name : "Drop a CSV here or click to choose — needs a 'phone' column, 'name' optional"}</span>
          <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => setFile(e.target.files[0])} data-testid="contact-lists-file-input" />
        </div>
        <button className="btn-primary" disabled={!file || busy} onClick={submit} data-testid="contact-lists-upload-btn">{busy ? "Importing…" : "Import list"}</button>
      </div>
    </div>
  );
}

export default function Lists() {
  const api = useApi();
  const me = useMe();
  const admin = me.role === "admin";
  const [lists, setLists] = useState(null);
  const [assigning, setAssigning] = useState(null);
  const load = useCallback(() => api.get("/lists").then((r) => setLists(r.data)), [api]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn, msg) => { try { const r = await fn(); toast.success(msg(r.data)); load(); } catch (e) { toast.error(errMsg(e)); } };
  const download = (l) => downloadBlob(api, `/lists/${l.id}/file`, l.file_name || `${l.name}.csv`).catch((e) => toast.error(errMsg(e)));

  return (
    <div data-testid="lists-page">
      <PageHeader eyebrow="Contacts" title="Contact lists" />
      <Uploader onDone={load} />
      <div className="card overflow-x-auto" data-testid="contact-lists-table">
        <table className="w-full min-w-[760px]">
          <thead><tr><th className="th">List</th><th className="th">Contacts</th><th className="th">Progress</th><th className="th">Left</th><th className="th">Agents</th><th className="th text-right">Actions</th></tr></thead>
          <tbody>
            {lists?.length === 0 && <tr><td className="td text-slate-500" colSpan={6}>No lists yet — import your first CSV above.</td></tr>}
            {lists?.map((l) => (
              <tr key={l.id} className="hover:bg-white/[0.02]" data-testid={`contact-list-row-${l.id}`}>
                <td className="td"><Link to={`/lists/${l.id}`} className="font-semibold text-white hover:text-accent" data-testid={`contact-list-open-${l.id}`}>{l.name}</Link>
                  <div className="text-xs text-slate-500">{fmtDate(l.created_at)} · {l.created_by_name}</div></td>
                <td className="td font-mono">{l.total}</td>
                <td className="td"><Progress stats={l.stats} total={l.total} /></td>
                <td className="td font-mono">{l.stats.pending + l.stats.callback}</td>
                <td className="td font-mono">{l.assigned_to.length}</td>
                <td className="td">
                  <div className="flex justify-end gap-1">
                    {l.file_path && <button title="Download original CSV" className="btn-ghost !p-2" onClick={() => download(l)} data-testid={`contact-list-download-${l.id}`}><Download size={15} /></button>}
                    {admin && <>
                      <button title="Assign agents" className="btn-ghost !p-2" onClick={() => setAssigning(l)} data-testid={`contact-list-assign-${l.id}`}><UserPlus size={15} /></button>
                      <button title="Re-queue no answer / busy / voicemail" className="btn-ghost !p-2" onClick={() => act(() => api.post(`/lists/${l.id}/requeue`), (d) => `${d.requeued} contacts re-queued`)} data-testid={`contact-list-requeue-${l.id}`}><RotateCcw size={15} /></button>
                      <button title="Delete list" className="btn-ghost !p-2 hover:!text-rose-400" onClick={() => window.confirm(`Delete "${l.name}" and all its contacts?`) && act(() => api.delete(`/lists/${l.id}`), () => "List deleted")} data-testid={`contact-list-delete-${l.id}`}><Trash2 size={15} /></button>
                    </>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {assigning && <AssignModal list={assigning} onClose={() => setAssigning(null)} onSaved={() => { setAssigning(null); load(); }} />}
    </div>
  );
}

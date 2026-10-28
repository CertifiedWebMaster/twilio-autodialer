import { useEffect, useRef, useState } from "react";
import { Download, Paperclip, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { errMsg, fmtDate, useApi } from "../lib/api";
import { downloadBlob } from "../lib/twilio";
import { useMe } from "../lib/me";

export default function Attachments({ contactId, callId }) {
  const api = useApi();
  const me = useMe();
  const input = useRef(null);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (contactId) api.get(`/contacts/${contactId}/attachments`).then((r) => setFiles(r.data)).catch(() => setFiles([]));
  }, [api, contactId]);

  const upload = async (file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    if (callId) fd.append("call_id", callId);
    setBusy(true);
    try {
      const r = await api.post(`/contacts/${contactId}/attachments`, fd);
      setFiles((f) => [r.data, ...f]);
      toast.success("File attached");
    } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
    input.current.value = "";
  };

  const remove = async (id) => {
    try { await api.delete(`/attachments/${id}`); setFiles((f) => f.filter((x) => x.id !== id)); }
    catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <div data-testid="attachments-panel">
      <div className="flex items-center justify-between mb-3">
        <span className="label flex items-center gap-2"><Paperclip size={13} /> Attachments</span>
        <button className="btn-ghost !py-1 !px-3 text-xs" disabled={busy} onClick={() => input.current.click()} data-testid="attachment-upload-btn">
          <Upload size={13} />{busy ? "Uploading…" : "Attach"}
        </button>
        <input ref={input} type="file" className="hidden" onChange={(e) => upload(e.target.files[0])} data-testid="attachment-file-input" />
      </div>
      {files.length === 0 && <p className="text-xs text-slate-500">No files yet.</p>}
      <ul className="space-y-1.5">
        {files.map((f) => (
          <li key={f.id} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2 text-sm" data-testid={`attachment-${f.id}`}>
            <span className="truncate flex-1 text-slate-200">{f.original_filename}</span>
            <span className="text-[11px] text-slate-500 hidden sm:inline">{fmtDate(f.created_at)}</span>
            <button className="text-slate-400 hover:text-white" onClick={() => downloadBlob(api, `/attachments/${f.id}/download`, f.original_filename)} data-testid={`attachment-download-${f.id}`}><Download size={15} /></button>
            {(me.role === "admin" || f.uploaded_by === me.user_id) && (
              <button className="text-slate-500 hover:text-rose-400" onClick={() => remove(f.id)} data-testid={`attachment-delete-${f.id}`}><Trash2 size={15} /></button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

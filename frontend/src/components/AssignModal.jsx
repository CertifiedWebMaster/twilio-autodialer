import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { errMsg, useApi } from "../lib/api";

export default function AssignModal({ list, onClose, onSaved }) {
  const api = useApi();
  const [users, setUsers] = useState([]);
  const [sel, setSel] = useState(new Set(list.assigned_to));
  useEffect(() => { api.get("/users").then((r) => setUsers(r.data.users)).catch((e) => toast.error(errMsg(e))); }, [api]);
  const toggle = (id) => { const s = new Set(sel); s.has(id) ? s.delete(id) : s.add(id); setSel(s); };
  const save = async () => {
    try { await api.patch(`/lists/${list.id}/assign`, { assigned_to: [...sel] }); toast.success("Agents updated"); onSaved(); }
    catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose} data-testid="assign-modal">
      <div className="card w-full max-w-md p-6 bg-surface animate-rise" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div><div className="label">Assign agents</div><div className="font-display text-xl font-bold text-white">{list.name}</div></div>
          <button className="btn-ghost !p-2" onClick={onClose} data-testid="assign-modal-close-btn"><X size={16} /></button>
        </div>
        <div className="flex flex-col gap-1 max-h-72 overflow-y-auto">
          {users.map((u) => (
            <label key={u.user_id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-white/5 cursor-pointer">
              <input type="checkbox" className="accent-indigo-500 h-4 w-4" checked={sel.has(u.user_id)} onChange={() => toggle(u.user_id)} data-testid={`assign-modal-user-${u.user_id}`} />
              <div className="min-w-0"><div className="text-sm text-white truncate">{u.name}</div><div className="text-xs text-slate-500 truncate">{u.email} · {u.role}</div></div>
            </label>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-4">Teammates appear here after their first sign-in.</p>
        <button className="btn-primary w-full mt-5" onClick={save} data-testid="assign-modal-save-btn">Save</button>
      </div>
    </div>
  );
}

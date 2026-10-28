import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { errMsg, fmtDate, useApi } from "../lib/api";
import { useMe } from "../lib/me";
import PageHeader from "../components/PageHeader";

export default function Team() {
  const api = useApi();
  const me = useMe();
  const [data, setData] = useState(null);
  const load = useCallback(() => api.get("/users").then((r) => setData(r.data)).catch((e) => toast.error(errMsg(e))), [api]);
  useEffect(() => { if (me.role === "admin") load(); }, [load, me.role]);
  if (me.role !== "admin") return <Navigate to="/" replace />;
  const change = async (u, role) => {
    try { await api.patch(`/users/${u.user_id}/role`, { role }); toast.success(`${u.name} is now ${role}`); load(); }
    catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div data-testid="team-page">
      <PageHeader eyebrow="Admin" title="Team" />
      <p className="text-sm text-slate-400 mb-6 max-w-2xl">Teammates sign in with Google and join as agents. Agents only see lists assigned to them and their own calls; admins see everything.</p>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead><tr><th className="th">Person</th><th className="th">Joined</th><th className="th">Role</th></tr></thead>
          <tbody>
            {data?.users.map((u) => (
              <tr key={u.user_id} className="hover:bg-white/[0.02]" data-testid={`team-row-${u.user_id}`}>
                <td className="td"><div className="text-white">{u.name}{u.user_id === me.user_id && <span className="text-xs text-slate-500"> (you)</span>}</div><div className="text-xs text-slate-500">{u.email}</div></td>
                <td className="td text-slate-400">{fmtDate(u.created_at)}</td>
                <td className="td">
                  <select className="input !w-auto !py-1.5" value={u.role} onChange={(e) => change(u, e.target.value)} data-testid={`team-role-select-${u.user_id}`}>
                    {data.roles.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

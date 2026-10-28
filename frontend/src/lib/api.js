import axios from "axios";
import { useMemo } from "react";
import { useAuth } from "@clerk/react";

const BASE = `${process.env.REACT_APP_BACKEND_URL}/api`;

export function useApi() {
  const { getToken } = useAuth();
  return useMemo(() => {
    const inst = axios.create({ baseURL: BASE });
    inst.interceptors.request.use(async (cfg) => {
      const t = await getToken();
      if (t) cfg.headers.Authorization = `Bearer ${t}`;
      return cfg;
    });
    return inst;
  }, [getToken]);
}

export const errMsg = (e) => e?.response?.data?.detail || e?.message || "Something went wrong";

export const OUTCOMES = [
  { key: "interested", label: "Interested", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  { key: "not_interested", label: "Not interested", cls: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
  { key: "voicemail", label: "Voicemail", cls: "bg-purple-500/15 text-purple-300 border-purple-500/30" },
  { key: "no_answer", label: "No answer", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  { key: "busy", label: "Busy", cls: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30" },
  { key: "wrong_number", label: "Wrong number", cls: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
  { key: "callback", label: "Callback", cls: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  { key: "do_not_call", label: "Do not call", cls: "bg-red-600/20 text-red-300 border-red-500/40" },
];

export const fmtDur = (s = 0) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
export const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—");

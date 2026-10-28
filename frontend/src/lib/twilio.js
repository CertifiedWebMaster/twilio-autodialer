import { useEffect, useRef } from "react";
import { Device } from "@twilio/voice-sdk";

const BASE = `${process.env.REACT_APP_BACKEND_URL}/api`;

export function useTwilioDevice(api) {
  const ref = useRef(null);
  useEffect(() => () => { ref.current?.destroy(); ref.current = null; }, []);
  return async () => {
    if (ref.current) return ref.current;
    const { data } = await api.get("/twilio/token");
    const device = new Device(data.token, { codecPreferences: ["opus", "pcmu"], closeProtection: true, logLevel: 1 });
    device.on("tokenWillExpire", async () => {
      const r = await api.get("/twilio/token");
      device.updateToken(r.data.token);
    });
    ref.current = device;
    return device;
  };
}

export async function streamAI(path, body, token, onChunk) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.detail || "AI request failed");
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop();
    for (const p of parts) {
      const d = p.replace(/^data: /, "");
      if (d === "[DONE]") return;
      const j = JSON.parse(d);
      if (j.error) throw new Error(j.error);
      onChunk(j.t);
    }
  }
}

export async function downloadBlob(api, path, filename) {
  const r = await api.get(path, { responseType: "blob" });
  const url = URL.createObjectURL(r.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

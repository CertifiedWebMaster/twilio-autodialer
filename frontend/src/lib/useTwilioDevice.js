import { useCallback, useEffect, useRef } from "react";
import { Device } from "@twilio/voice-sdk";

export function useTwilioDevice(api) {
  const deviceRef = useRef(null);

  const ensure = useCallback(async () => {
    if (deviceRef.current) return deviceRef.current;
    const { data } = await api.get("/twilio/token");
    const device = new Device(data.token, { codecPreferences: ["opus", "pcmu"], closeProtection: true });
    device.on("tokenWillExpire", async () => {
      const r = await api.get("/twilio/token");
      device.updateToken(r.data.token);
    });
    deviceRef.current = device;
    return device;
  }, [api]);

  useEffect(() => () => { deviceRef.current?.destroy(); deviceRef.current = null; }, []);
  return ensure;
}

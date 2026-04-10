import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";
import { apiJson } from "./api";
import { getUserId } from "./session";


type PresenceEvent = {
  type: "presence";
  userId: string;
  online: boolean;
  at: string;
};


type PresenceMap = Record<string, string | null>;


type WsTokenResponse = {
  token: string;
  expiresInSec: number;
};


type PresenceContextValue = {
  onlineByUserId: PresenceMap;
  setFromSnapshot: (next: PresenceMap) => void;
  applyPresenceEvent: (evt: PresenceEvent) => void;
  isUserOnline: (userId: string, nowMs?: number) => boolean;
};


const PresenceContext = createContext<PresenceContextValue | null>(null);


const ONLINE_WINDOW_MS = 75_000;


function getWsBase() {
  const fromEnv = (process.env.EXPO_PUBLIC_WS_BASE || "").trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");

  if (__DEV__) {
    throw new Error("Missing EXPO_PUBLIC_WS_BASE");
  }
  return "wss://ws.yapme.app";
}


export function PresenceProvider({ children }: { children: React.ReactNode }) {
  const [onlineByUserId, setOnlineByUserId] = useState<PresenceMap>({});
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedRef = useRef(false);


  const setFromSnapshot = useCallback((next: PresenceMap) => {
    setOnlineByUserId((prev) => ({ ...prev, ...next }));
  }, []);


  const applyPresenceEvent = useCallback((evt: PresenceEvent) => {
  if (!evt?.userId || !evt?.at) return;


  setOnlineByUserId((prev) => ({
    ...prev,
    [evt.userId]: evt.online ? evt.at : null,
  }));
}, []);



  const isUserOnline = useCallback(
    (userId: string, nowMs = Date.now()) => {
      const lastSeenAt = onlineByUserId[userId];
      if (!lastSeenAt) return false;
      const t = Date.parse(lastSeenAt);
      if (!Number.isFinite(t)) return false;
      return nowMs - t <= ONLINE_WINDOW_MS;
    },
    [onlineByUserId]
  );


  const cleanup = useCallback(() => {
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws) {
      try {
        ws.close();
      } catch {}
    }
  }, []);


  const connect = useCallback(async () => {
    try {
      const myUserId = await getUserId();
      if (!myUserId) return;


      const roomId = `user:${myUserId}`;
      const tok = await apiJson<WsTokenResponse>(
        `/api/realtime/ws-token?roomId=${encodeURIComponent(roomId)}`
      );


      const ws = new WebSocket(`${getWsBase()}/ws/${encodeURIComponent(roomId)}`);
      wsRef.current = ws;


      ws.onopen = () => {
        try {
          ws.send(JSON.stringify({ type: "auth", token: tok.token }));
        } catch {}
      };


      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data ?? ""));
         if (msg?.type === "presence" && typeof msg.userId === "string") {

          applyPresenceEvent({
             type: "presence",
             userId: msg.userId,
             online: !!msg.online,
             at: typeof msg.at === "string" ? msg.at : new Date().toISOString(),
            });
          }
        } catch {}
      };


      ws.onerror = () => {
        cleanup();
        if (!closedRef.current && !reconnectTimerRef.current) {
          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null;
            void connect();
          }, 2500);
        }
      };


      ws.onclose = () => {
        cleanup();
        if (!closedRef.current && !reconnectTimerRef.current) {
          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null;
            void connect();
          }, 2500);
        }
      };
    } catch {
      if (!closedRef.current && !reconnectTimerRef.current) {
        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null;
          void connect();
        }, 2500);
      }
    }
  }, [applyPresenceEvent, cleanup]);


  useEffect(() => {
    closedRef.current = false;
    void connect();


    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && !wsRef.current) {
        void connect();
      }
    });


    return () => {
      closedRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      sub.remove();
      cleanup();
    };
  }, [cleanup, connect]);


  const value = useMemo(
    () => ({
      onlineByUserId,
      setFromSnapshot,
      applyPresenceEvent,
      isUserOnline,
    }),
    [onlineByUserId, setFromSnapshot, applyPresenceEvent, isUserOnline]
  );


  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}


export function usePresence() {
  const ctx = useContext(PresenceContext);
  if (!ctx) throw new Error("usePresence must be used inside PresenceProvider");
  return ctx;
}



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
import { getUserId } from "./session";
import {
   closeWs,
   connectRealtime, 
   roomForUser, 
  } from "./realtime";
  import type { UserRealtimeEvent } from "./realtimeEvents";


type PresenceEvent = {
  type: "presence";
  userId: string;
  online: boolean;
  at: string;
};


type PresenceMap = Record<string, string | null>;
type RealtimeListener = (evt: UserRealtimeEvent ) => void;

type PresenceContextValue = {
  onlineByUserId: PresenceMap;
  setFromSnapshot: (next: PresenceMap) => void;
  applyPresenceEvent: (evt: PresenceEvent) => void;
  isUserOnline: (userId: string, nowMs?: number) => boolean;
  subscribe: (listener: RealtimeListener) => () => void;
};

const PresenceContext = createContext<PresenceContextValue | null>(null);

const ONLINE_WINDOW_MS = 75_000;
const RECONNECT_DELAY_MS = 2500;

export function PresenceProvider({ children }: { children: React.ReactNode }) {
  const [onlineByUserId, setOnlineByUserId] = useState<PresenceMap>({});
  const wsRef = useRef<WebSocket | null>(null);
  const roomIdRef = useRef<string | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedRef = useRef(false);
  const connectingRef = useRef(false);
  const connectRef = useRef<(() => void) | null>(null);

  const setFromSnapshot = useCallback((next: PresenceMap) => {
    setOnlineByUserId((prev) => ({ ...prev, ...next }));
  }, []);

  const listenersRef = useRef(new Set<RealtimeListener>());

  const subscribe = useCallback((listener: RealtimeListener) => {
    listenersRef.current.add(listener);

    return () => {
      listenersRef.current.delete(listener);
    };
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


   const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);


  const cleanup = useCallback(() => {
    const ws = wsRef.current;

    wsRef.current = null;
    roomIdRef.current = null;

    if (ws) {
      closeWs(ws);
    }
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (closedRef.current) return;
    if (reconnectTimerRef.current) return;

    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      connectRef.current?.();
    }, RECONNECT_DELAY_MS);
  }, []);

      const handleRealtimeMessage = useCallback(
  (msg: UserRealtimeEvent) => {
    if (!msg || typeof msg !== "object") return;

    if (msg.type === "presence" && typeof msg.userId === "string") {
      applyPresenceEvent({
        type: "presence",
        userId: msg.userId,
        online: !!msg.online,
        at: typeof msg.at === "string" ? msg.at : new Date().toISOString(),
      });

      return;
    }

    if (typeof msg.type === "string" && msg.type.startsWith("notif:")) {
      for (const listener of listenersRef.current) {
        try {
          listener(msg);
        } catch (err) {
          console.warn("User realtime listener failed:", err);
        }
      }
    }
  },
  [applyPresenceEvent]
);

  const connect = useCallback(async () => {
    if (closedRef.current) return;
    if (connectingRef.current) return;

    connectingRef.current = true;

    try {
      const myUserId = await getUserId();
      if (!myUserId || closedRef.current) return;

      const roomId = roomForUser(myUserId);

      if (wsRef.current && roomIdRef.current === roomId) {
        return;
      }

      cleanup();
      clearReconnectTimer();

      roomIdRef.current = roomId;

      const ws = await connectRealtime({
        roomId,
        allowOneReconnect: false,

        onMessage: (data) => {
          handleRealtimeMessage(data);
        },

        onClose: () => {
          wsRef.current = null;
          roomIdRef.current = null;
          scheduleReconnect();
        },

        onError: () => {
          wsRef.current = null;
          roomIdRef.current = null;
          scheduleReconnect();
        },
      });

      if (closedRef.current) {
        closeWs(ws);
        return;
      }

      wsRef.current = ws;
    } catch (err) {
      console.warn("Presence realtime connect failed:", err);
      scheduleReconnect();
    } finally {
      connectingRef.current = false;
    }
  }, [
    cleanup,
    clearReconnectTimer,
    handleRealtimeMessage,
    scheduleReconnect,
  ]);

  useEffect(() => {
    connectRef.current = () => {
      void connect();
    };
  }, [connect]);

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
      clearReconnectTimer();
      sub.remove();
      cleanup();
    };
  }, [cleanup, clearReconnectTimer, connect]);

  const value = useMemo(
    () => ({
      onlineByUserId,
      setFromSnapshot,
      applyPresenceEvent,
      isUserOnline,
      subscribe,
    }),
    [onlineByUserId, setFromSnapshot, applyPresenceEvent, isUserOnline, subscribe]
  );

  return (
    <PresenceContext.Provider value={value}>
      {children}
    </PresenceContext.Provider>
  );
}

export function usePresence() {
  const ctx = useContext(PresenceContext);
  if (!ctx) throw new Error("usePresence must be used inside PresenceProvider");
  return ctx;
}

export default usePresence;
  



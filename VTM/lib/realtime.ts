// VTM/lib/realtime.ts
import { apiJson } from "./api";
import type { WsTokenResponse } from "./types";


export function roomForConversation(conversationId: string) {
  return `convo:${conversationId}`;
}


export function roomForUser(userId: string) {
  return `user:${userId}`;
}


function pickWsBase(): string {
  const fromEnv = (process.env.EXPO_PUBLIC_WS_BASE || "").trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");


  if (__DEV__) {
    throw new Error("Missing EXPO_PUBLIC_WS_BASE");
 }
 
  return "wss://ws.yapme.app";
}


function buildWsUrl(roomId: string) {
  const base = pickWsBase();
  return `${base}/ws/${encodeURIComponent(roomId)}`;
}


export async function getWsToken(roomId: string): Promise<WsTokenResponse> {
  const qs = `?roomId=${encodeURIComponent(roomId)}`;
  return await apiJson<WsTokenResponse>(`/api/realtime/ws-token${qs}`);
}


export type RealtimeConnectOptions = {
  roomId: string;
  onOpen?: () => void; // now means: authenticated + welcomed
  onClose?: (ev: WebSocketCloseEvent) => void;
  onError?: (ev: Event) => void;
  onMessage?: (data: any, rawEvent: WebSocketMessageEvent) => void;
  allowOneReconnect?: boolean;
};


type WsAuthMessage = {
  type: "auth";
  token: string;
};


export async function connectRealtime(opts: RealtimeConnectOptions): Promise<WebSocket> {
  const { roomId } = opts;


  let didReconnect = false;
  let manuallyClosed = false;
  let openNotified = false;


  const connectWithFreshToken = async (): Promise<WebSocket> => {
    const { token } = await getWsToken(roomId);
    const ws = new WebSocket(buildWsUrl(roomId));


    const attachHandlers = (sock: WebSocket, authToken: string) => {
      sock.onopen = () => {
        const authMsg: WsAuthMessage = {
          type: "auth",
          token: authToken,
        };
        sendJson(sock, authMsg);
      };


      sock.onerror = (ev: Event) => {
        opts.onError?.(ev);
      };


      sock.onmessage = (evt: WebSocketMessageEvent) => {
        const parsed = safeParse((evt as any).data);


        // Treat server welcome as the real authenticated open.
        if (parsed && typeof parsed === "object" && parsed.type === "welcome") {
          if (!openNotified) {
            openNotified = true;
            opts.onOpen?.();
          }
          opts.onMessage?.(parsed, evt);
          return;
        }


        opts.onMessage?.(parsed, evt);
      };


      sock.onclose = async (ev: WebSocketCloseEvent) => {
        opts.onClose?.(ev);


        if (manuallyClosed) return;
        if (!opts.allowOneReconnect || didReconnect) return;


        didReconnect = true;
        openNotified = false;


        try {
          const replacement = await connectWithFreshToken();
          (replacement as any).__markManualClose = () => {
            manuallyClosed = true;
          };
        } catch {
          // ignore
        }
      };
    };


    attachHandlers(ws, token);


    (ws as any).__markManualClose = () => {
      manuallyClosed = true;
    };


    return ws;
  };


  return await connectWithFreshToken();
}


export function isWsOpen(ws: WebSocket | null | undefined): ws is WebSocket {
  return !!ws && ws.readyState === WebSocket.OPEN;
}


export function closeWs(ws: WebSocket | null | undefined) {
  if (!ws) return;


  try {
    (ws as any).__markManualClose?.();
    ws.close();
  } catch {
    // ignore
  }
}


/**
 * Safe JSON send. Never throws. Returns true if sent.
 */
export function sendJson(ws: WebSocket | null | undefined, obj: any) {
  if (!isWsOpen(ws)) return false;
  try {
    ws.send(JSON.stringify(obj));
    return true;
  } catch {
    return false;
  }
}


function safeParse(data: any) {
  if (typeof data !== "string") return data;
  const s = data.trim();
  if (!s) return s;
  if (s[0] !== "{" && s[0] !== "[") return s;
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

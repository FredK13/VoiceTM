// yapme-realtime/src/index.ts
import { DurableObject } from "cloudflare:workers";


type JwtClaims = {
  userId?: string;
  exp?: number;
  rid?: string;
};


type ClientAuthMessage = {
  type: "auth";
  token: string;
};


type SocketMeta = {
  roomId: string;
  userId: string | null;
  authenticated: boolean;
};


export interface Env {
  REALTIME: DurableObjectNamespace<YapMeRealtime>;
  WS_JWT_SECRET: string;
  DEBUG_WS?: string;
  WS_INTERNAL_BROADCAST_SECRET: string;
}


// ---------- Helpers ----------
function base64UrlToUint8(b64url: string) {
  const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
  const b64 = (b64url + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function isInternalAuthorized(request: Request, env: Env) {
  return (request.headers.get("x-internal-broadcast") || "") === env.WS_INTERNAL_BROADCAST_SECRET;
}


async function verifyHs256Jwt(token: string, secret: string): Promise<JwtClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;


  const [h, p, s] = parts;
  const data = new TextEncoder().encode(`${h}.${p}`);
  const sig = base64UrlToUint8(s);


  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );


  const ok = await crypto.subtle.verify("HMAC", key, sig, data);
  if (!ok) return null;


  const payloadJson = new TextDecoder().decode(base64UrlToUint8(p));
  const payload = JSON.parse(payloadJson) as JwtClaims;


  if (!payload.userId) return null;
  if (payload.exp && Date.now() / 1000 > payload.exp) return null;


  return payload;
}


function safeOriginAllowed(origin: string | null) {
  if (!origin) return true; // RN often sends no Origin
  return (
    origin === "https://yapme.io" ||
    origin === "https://yapme.app" ||
    origin === "https://ws.yapme.app"
  );
}


function extractRoomIdFromPath(pathname: string) {
  if (!pathname.startsWith("/ws/")) return "";
  const raw = pathname.slice("/ws/".length);
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}


function safeParseJson(message: string | ArrayBuffer): any | null {
  if (typeof message !== "string") return null;
  try {
    return JSON.parse(message);
  } catch {
    return null;
  }
}


function safeWsType(message: string | ArrayBuffer) {
  if (typeof message !== "string") return "binary";
  try {
    const obj = JSON.parse(message);
    return String(obj?.type ?? "unknown");
  } catch {
    return "text";
  }
}


// ---------- Durable Object ----------
export class YapMeRealtime extends DurableObject<Env> {
  private get debugWs() {
    return this.env.DEBUG_WS === "true";
  }

  private readMeta(ws: WebSocket): SocketMeta | null {
    try {
      const meta = ws.deserializeAttachment();
      if (!meta || typeof meta !== "object") return null;


      const roomId = typeof meta.roomId === "string" ? meta.roomId : "";
      const userId =
        typeof meta.userId === "string" ? meta.userId : meta.userId === null ? null : null;
      const authenticated = !!meta.authenticated;


      if (!roomId) return null;


      return { roomId, userId, authenticated };
    } catch {
      return null;
    }
  }


  private writeMeta(ws: WebSocket, meta: SocketMeta) {
    ws.serializeAttachment(meta);
  }


  private getAuthedSocketsInRoom(roomId: string): WebSocket[] {
    return this.ctx.getWebSockets().filter((s) => {
      const meta = this.readMeta(s);
      return !!meta && meta.authenticated && meta.roomId === roomId;
    });
  }


  private broadcastToRoom(roomId: string, payload: unknown, except?: WebSocket) {
    const text = JSON.stringify(payload);
    for (const s of this.getAuthedSocketsInRoom(roomId)) {
      if (except && s === except) continue;
      try {
        s.send(text);
      } catch {
        // ignore
      }
    }
  }


  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST") {
      const body = (await request.json().catch(() => null)) as
        | { roomId?: string; event?: unknown }
        | null;


      const roomId = typeof body?.roomId === "string" ? body.roomId.trim() : "";
      if (!roomId) {
        return new Response("Bad Request", { status: 400 });
      }


      this.broadcastToRoom(roomId, body?.event ?? {});
        return Response.json({ ok: true });
      }


      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected websocket", { status: 426 });
      }


    const origin = request.headers.get("Origin");
      if (!safeOriginAllowed(origin)) {
      if (this.debugWs) {
        console.log("AUTH FAIL: origin blocked", { origin });
      }
      return new Response("Forbidden", { status: 403 });
    }


    const roomId = extractRoomIdFromPath(url.pathname);
    if (!roomId) {
      if (this.debugWs) {
        console.log("AUTH FAIL: missing roomId", { pathname: url.pathname });
      }
      return new Response("Bad Request", { status: 400 });
    }


    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];


    this.ctx.acceptWebSocket(server);


    this.writeMeta(server, {
      roomId,
      userId: null,
      authenticated: false,
    });

    
    if (this.debugWs) {
      console.log("WS CONNECT PENDING", {
        roomId,
        roomSize: this.ctx.getWebSockets().length,
      });
    }

    return new Response(null, { status: 101, webSocket: client });
  }


  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const type = safeWsType(message);
    const meta = this.readMeta(ws);


    if (!meta) {
      try {
        ws.close(1011, "Socket state missing");
      } catch {}
      return;
    }


    // First message must authenticate the socket.
    if (!meta.authenticated) {
      const parsed = safeParseJson(message) as ClientAuthMessage | null;


      if (!parsed || parsed.type !== "auth" || typeof parsed.token !== "string" || !parsed.token.trim()) {
        if (this.debugWs) {
          console.log("AUTH FAIL: expected auth message", {
            roomId: meta.roomId,
            roomSize: this.ctx.getWebSockets().length,
            type,
          });
        }
        try {
          ws.close(1008, "Authentication required");
        } catch {}
        return;
      }


      const claims = await verifyHs256Jwt(parsed.token, this.env.WS_JWT_SECRET);
      if (!claims) {
        if (this.debugWs) {
          console.log("AUTH FAIL: JWT VERIFY FAILED", { roomId: meta.roomId });
        }
        try {
          ws.close(1008, "Unauthorized");
        } catch {}
        return;
      }


      if (claims.rid !== meta.roomId) {
        if (this.debugWs) {
          console.log("AUTH FAIL: RID MISMATCH", {
            claim: claims.rid,
            roomId: meta.roomId,
          });
        }
        try {
          ws.close(1008, "Unauthorized");
        } catch {}
        return;
      }


      const authedMeta: SocketMeta = {
        roomId: meta.roomId,
        userId: claims.userId ?? null,
        authenticated: true,
      };
      this.writeMeta(ws, authedMeta);


      const roomSockets = this.getAuthedSocketsInRoom(authedMeta.roomId);

      if (this.debugWs) {
        console.log("WS AUTH OK", {
         roomId: authedMeta.roomId,
         userId: authedMeta.userId,
         roomSize: roomSockets.length,
       });
      }

      try {
        ws.send(
          JSON.stringify({
            type: "welcome",
            userId: authedMeta.userId,
            roomId: authedMeta.roomId,
          })
        );
      } catch {
        try {
          ws.close(1011, "Failed to send welcome");
        } catch {}
        return;
      }


      for (const s of roomSockets) {
        if (s === ws) continue;
        const sMeta = this.readMeta(s);
        if (!sMeta?.userId) continue;


        try {
          ws.send(
            JSON.stringify({
              type: "presence",
              userId: sMeta.userId,
              online: true,
              at: new Date().toISOString(),
            })
          );
        } catch {
          // ignore
        }
      }


      if (authedMeta.userId) {
        this.broadcastToRoom(
          authedMeta.roomId,
          {
            type: "presence",
            userId: authedMeta.userId,
            online: true,
            at: new Date().toISOString(),
          },
          ws
        );
      }


      return;
    }


    const payload =
      typeof message === "string" ? message : new TextDecoder().decode(message);


    const authedSockets = this.getAuthedSocketsInRoom(meta.roomId);


    if (this.debugWs) {
      console.log("WS EVENT", {
        type,
        roomId: meta.roomId,
        userId: meta.userId,
        roomSize: authedSockets.length,
      });
    }


    for (const s of authedSockets) {
      try {
        s.send(payload);
      } catch {
        // ignore
      }
    }
  }


  async webSocketClose(ws: WebSocket) {
    const meta = this.readMeta(ws);


    const roomId = meta?.roomId ?? "unknown";
    const roomSize = meta?.roomId
      ? this.getAuthedSocketsInRoom(meta.roomId).filter((s) => s !== ws).length
      : 0;


    if (this.debugWs) {
      console.log("WS CLOSE", {
        roomId,
        userId: meta?.userId ?? null,
        roomSize,
      });
    }


    if (meta?.authenticated && meta.userId) {
      this.broadcastToRoom(
        roomId,
        {
          type: "presence",
          userId: meta.userId,
          online: false,
          at: new Date().toISOString(),
        },
        ws
      );
    }
  }


  async webSocketError(ws: WebSocket, _err: unknown) {
    const meta = this.readMeta(ws);
    if (this.debugWs) {
      console.log("WS ERROR", {
        roomId: meta?.roomId ?? "unknown",
        userId: meta?.userId ?? null,
      });
    }
  }
}


// ---------- Worker router ----------
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const DEBUG_WS = env.DEBUG_WS === "true";

    if (url.pathname === "/internal/broadcast" && request.method === "POST") {
      if (!isInternalAuthorized(request, env)) {
        return new Response("Forbidden", { status: 403 });
      }


      const body = (await request.json().catch(() => null)) as
        | { roomIds?: string[]; event?: unknown }
        | null;


      const roomIds = Array.isArray(body?.roomIds)
        ? body.roomIds.filter((x) => typeof x === "string" && x.trim())
        : [];


      for (const roomId of roomIds) {
        const id = env.REALTIME.idFromName(roomId);
        const stub = env.REALTIME.get(id);


      await stub.fetch(
        new Request("https://internal/broadcast-room", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            roomId,
            event: body?.event ?? {},
          }),
        })
      );
    }


    return Response.json({ ok: true, rooms: roomIds.length });
  }


    if (url.pathname.startsWith("/ws/")) {
      const roomId = extractRoomIdFromPath(url.pathname) || "default";

      if (DEBUG_WS) {
        console.log("ROUTE", { roomId });
      }

      const id = env.REALTIME.idFromName(roomId);
      const stub = env.REALTIME.get(id);


      return stub.fetch(request);
    }


    return new Response("OK", { status: 200 });
  },
} satisfies ExportedHandler<Env>;



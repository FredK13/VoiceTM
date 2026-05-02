import { useCallback, useEffect, useRef, useState } from "react";
import { apiJson, } from "../../lib/api";
import {
  connectRealtime,
  roomForConversation,
  sendJson,
  closeWs,
  isWsOpen,
} from "../../lib/realtime";
import type { Conversation } from "../../lib/types";
import type { ChatOverlayMessage } from "../components/ChatOverlay";
import { mapApiMessageToChatMessage, sortChatMessagesByCreatedAt } from "../../lib/chatMessageMapper";


type WsMsgNew = {
  type: "msg:new";
  convoId: string;
  messageId: string;
  senderId: string;
  createdAt?: string;
};


type WsTyping = {
  type: "typing";
  convoId: string;
  userId: string;
  isTyping: boolean;
};


type WsReceipt = {
  type: "receipt";
  convoId: string;
  messageId: string;
  status: "read" | "listened";
};


type WsPresence = {
  type: "presence";
  userId: string;
  online: boolean;
  at?: string;
};


type WsPresenceSync = {
  type: "presence:sync";
  convoId: string;
};


type WsAny =
  | WsMsgNew
  | WsTyping
  | WsReceipt
  | WsPresence
  | WsPresenceSync
  | { type: string; [k: string]: any };


type Args = {
  activeConversationId: string | null;
  myUserId: string | null;
  draft: string;
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
  setChatMessages: React.Dispatch<React.SetStateAction<ChatOverlayMessage[]>>;
};


export function useConversationRealtime({
  activeConversationId,
  myUserId,
  draft,
  setConversations,
  setChatMessages,
}: Args) {
  const wsRef = useRef<WebSocket | null>(null);
  const wsRoomRef = useRef<string | null>(null);


  const [otherTyping, setOtherTyping] = useState(false);
  const [presenceMap, setPresenceMap] = useState<Record<string, boolean>>({});


  const typingSendTimerRef = useRef<any>(null);
  const typingStopTimerRef = useRef<any>(null);
  const typingIsOnRef = useRef(false);


  const disconnectWs = useCallback(() => {
    const ws = wsRef.current;
    wsRef.current = null;
    wsRoomRef.current = null;
    setOtherTyping(false);
    setPresenceMap({});


    if (typingSendTimerRef.current) clearTimeout(typingSendTimerRef.current);
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    typingIsOnRef.current = false;


    if (ws) {
      if (myUserId) {
        sendJson(ws, {
          type: "presence",
          userId: myUserId,
          online: false,
          at: new Date().toISOString(),
        } satisfies WsPresence);
      }
      closeWs(ws);
    }
  }, [myUserId]);


  const fetchMessageById = useCallback(async (messageId: string) => {
    return await apiJson<any>(`/api/messages/${encodeURIComponent(messageId)}`);
  }, []);


  const handleWsPayload = useCallback(
    (payload: WsAny) => {
      const convoId = activeConversationId;
      if (!convoId) return;
      if (!payload || typeof payload !== "object") return;


      if (payload.type === "presence") {
        const p = payload as WsPresence;
        if (!p.userId) return;
        if (p.userId === myUserId) return;
        setPresenceMap((prev) => ({ ...prev, [p.userId]: !!p.online }));
        return;
      }


      if (payload.type === "presence:sync") {
        return;
      }


      if (payload.type === "typing") {
        const p = payload as WsTyping;
        if (p.convoId !== convoId) return;
        if (!p.userId || p.userId === myUserId) return;
        setOtherTyping(!!p.isTyping);
        return;
      }


      if (payload.type === "msg:new") {
        const p = payload as WsMsgNew;
        if (p.convoId !== convoId) return;
        if (p.senderId && p.senderId === myUserId) return;

        const messageId = String(p.messageId ?? "").trim();
        if (!messageId) return;


        (async () => {
          try {
            const m = await fetchMessageById(messageId);
            if (String(m.conversationId ?? "") !== convoId) return;


            setChatMessages((prev) => {
              if (prev.some((x) => x.id === messageId)) return prev;

              const incoming = mapApiMessageToChatMessage(
                {
                  ...m,
                  id: messageId,
                  senderId: m.senderId ?? p.senderId ?? "",
                },
                myUserId
              );

              return sortChatMessagesByCreatedAt([...prev, incoming]);
            });


            setConversations((prev) =>
              prev.map((c) => (c.id === convoId ? { ...c, lastMessage: m.text ?? c.lastMessage } : c))
            );
          } catch (err) {
            console.warn("Failed to fetch msg:new message:", err);
          }
        })();


        return;
      }


      if (payload.type === "receipt") {
        const p = payload as WsReceipt;
        if (p.convoId !== convoId) return;
        if (!p.messageId) return;


        const nowIso = new Date().toISOString();


        setChatMessages((prev) =>
          prev.map((m) => {
            if (!m.isMine) return m;
            if (m.id !== p.messageId) return m;


            if (p.status === "listened") {
              return { ...m, receipt: "listened", listenedAt: m.listenedAt ?? nowIso };
            }


            return m;
          })
        );
      }
    },
    [activeConversationId, myUserId, fetchMessageById, setChatMessages, setConversations]
  );


  const connectWsForConversation = useCallback(
    async (conversationId: string) => {
      const roomId = roomForConversation(conversationId);


      if (wsRef.current && wsRoomRef.current === roomId && isWsOpen(wsRef.current)) return;


      disconnectWs();
      wsRoomRef.current = roomId;


      try {
        const ws = await connectRealtime({
          roomId,
          allowOneReconnect: false,
          onOpen: () => {
            if (!myUserId) return;


            sendJson(ws, {
              type: "presence",
              userId: myUserId,
              online: true,
              at: new Date().toISOString(),
            } satisfies WsPresence);
          },
          onMessage: (data) => {
            handleWsPayload(data as WsAny);
          },
          onClose: () => {},
          onError: () => {},
        });


        wsRef.current = ws;
      } catch (e) {
        console.warn("WS connect failed:", e);
      }
    },
    [disconnectWs, handleWsPayload, myUserId]
  );


  useEffect(() => {
    if (!activeConversationId) {
      disconnectWs();
      return;
    }


    connectWsForConversation(activeConversationId).catch(() => {});


    return () => {
      disconnectWs();
    };
  }, [activeConversationId, connectWsForConversation, disconnectWs]);


  const sendTyping = useCallback(
    (isTyping: boolean) => {
      const convoId = activeConversationId;
      const ws = wsRef.current;
      if (!convoId || !myUserId || !ws || !isWsOpen(ws)) return;


      sendJson(ws, {
        type: "typing",
        convoId,
        userId: myUserId,
        isTyping,
      } satisfies WsTyping);
    },
    [activeConversationId, myUserId]
  );


  useEffect(() => {
    if (!activeConversationId || !myUserId) return;


    const hasText = !!draft.trim();


    if (hasText && !typingIsOnRef.current) {
      typingIsOnRef.current = true;
      sendTyping(true);
    }


    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = setTimeout(() => {
      if (!typingIsOnRef.current) return;
      typingIsOnRef.current = false;
      sendTyping(false);
    }, 1200);


    if (!hasText && typingIsOnRef.current) {
      if (typingSendTimerRef.current) clearTimeout(typingSendTimerRef.current);
      typingSendTimerRef.current = setTimeout(() => {
        typingIsOnRef.current = false;
        sendTyping(false);
      }, 120);
    }


    return () => {};
  }, [draft, activeConversationId, myUserId, sendTyping]);


  return {
    wsRef,
    otherTyping,
    presenceMap,
    disconnectWs,
    sendTyping,
  };
}


export default useConversationRealtime;

// app/utils/chatMessageMapper.ts
import { API_BASE } from "./api";
import type { ChatOverlayMessage } from "../app/components/ChatOverlay";


export type ApiMessageLike = {
  id: string;
  senderId?: string | null;
  text?: string | null;
  createdAt?: string;
  audioUrl?: string | null;
  audioDurationMs?: number | null;
  readAt?: string | null;
  listenedAt?: string | null;
};


export function mapApiMessageToChatMessage(
  m: ApiMessageLike,
  myUserId: string | null
): ChatOverlayMessage {
  const id = String(m.id);
  const senderId = String(m.senderId ?? "");
  const isMine = !!myUserId && senderId === myUserId;
  const listenedAt = m.listenedAt ?? null;


  return {
    id,
    senderId,
    isMine,
    text: String(m.text ?? ""),
    createdAt: m.createdAt,
    audioUrl: m.audioUrl ? `${API_BASE}/api/messages/${id}/audio` : null,
    audioDurationMs: m.audioDurationMs ?? null,
    readAt: m.readAt ?? null,
    listenedAt,
    receipt: isMine ? (listenedAt ? "listened" : "posted") : undefined,
  };
}


export function sortChatMessagesByCreatedAt<T extends { createdAt?: string }>(arr: T[]) {
  return [...arr].sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    return ta - tb;
  });
}

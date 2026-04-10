// lib/types.ts

// --- Core domain types ---

export type Conversation = {
  id: string;
  title: string;
  lastMessage: string | null;
  avatarUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;

  // ✅ backend includes these for 1:1 chat discovery
  otherUserId?: string | null;
  otherUsername?: string | null;
};

export type Message = {
  id: string;
  senderId: string;
  text: string;
  createdAt?: string;
  audioUrl?: string | null;
  audioDurationMs?: number | null;
  readAt?: string | null;
};

// --- Auth ---

export type AuthUser = {
  id: string;
  username: string;
  avatarUrl?: string | null;
};

export type AuthResponse = {
  token: string;
  user: AuthUser;
};

// --- Contacts (GET /api/contacts) ---

export type ContactUser = {
  id: string;
  username: string;
  avatarUrl?: string | null;
  voiceStatus?: string; // keep as string to avoid coupling frontend to prisma enum
  lastSeenAt?: string | null; // ✅ added (from backend)
};

export type ContactRow = {
  id: string;
  createdAt: string; // backend sends Date as ISO string
  user: ContactUser;
};

export type ContactsResponse = {
  contacts: ContactRow[];
};

// --- Conversation requests / invites (chat invites) ---

export type IncomingInvite = {
  id: string; // inviteId
  createdAt: string;
  fromUser: {
    id: string;
    username: string;
    avatarUrl?: string | null;
  };
};

export type OutgoingInvite = {
  id: string; // inviteId
  createdAt: string;
  toUser: {
    id: string;
    username: string;
    avatarUrl?: string | null;
  };
};

export type RequestResponse =
  | { status: "CREATED" }
  | { status: "PENDING_ALREADY" }
  | { status: "INCOMING_PENDING" }
  | { status: "REJOIN_SENT" }
  | { status: "ALREADY_CONNECTED"; conversationId: string };

export type AcceptInviteResponse = {
  ok: true;
  conversationId: string;
};

export type RejectInviteResponse = {
  ok: true;
};

// --- (Optional) Legacy / older type you had ---

export type ConversationRequest = {
  id: string; // invite id
  conversationId: string;
  fromUser: { id: string; username: string; avatarUrl?: string | null };
  createdAt: string;
  conversationTitle: string | null;
};

// --- Contact invites ---

export type IncomingContactInvite = {
  id: string;
  createdAt: string;
  fromUser: {
    id: string;
    username: string;
    avatarUrl?: string | null;
  };
};

export type OutgoingContactInvite = {
  id: string;
  createdAt: string;
  toUser: {
    id: string;
    username: string;
    avatarUrl?: string | null;
  };
};

export type ContactRequestResponse =
  | { status: "CREATED" }
  | { status: "PENDING_ALREADY" }
  | { status: "INCOMING_PENDING" }
  | { status: "ALREADY_ADDED" };


export type AcceptContactInviteResponse = { ok: true };
export type RejectContactInviteResponse = { ok: true };

// --- Presence ---
export type PresenceBatchResponse = {
  users: { id: string; lastSeenAt: string | null }[];
};

export type PresenceHeartbeatResponse = { ok: true };

// --- Realtime (WebSocket) ---
export type WsTokenResponse = {
  token: string;
  expiresInSec: number;
};

export type IncomingRejoinInvite = {
  kind: "rejoin";
  id: string;
  createdAt: string;
  conversationId: string;
  fromUser: { id: string; username: string; avatarUrl?: string | null };
};


export type OutgoingRejoinInvite = {
  kind: "rejoin";
  id: string;
  createdAt: string;
  conversationId: string;
  toUser: { id: string; username: string; avatarUrl?: string | null };
};

export type RecentlyLeftRow = {
  conversationId: string;
  leftAt: string | null;
  otherUserId: string | null;
  otherUsername: string;
  avatarUrl?: string | null;
};
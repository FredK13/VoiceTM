// vtm-backend/src/utils/realtimeEvents.ts

export type RealtimeEvent =
  | { type: "presence"; userId: string; online: boolean; at?: string }

  | { type: "notif:chat_request_created"; inviteId: string; fromUserId: string; toUserId: string }
  | { type: "notif:chat_request_cancelled"; inviteId: string; fromUserId: string; toUserId: string }
  | { type: "notif:chat_request_accepted"; inviteId: string; conversationId: string; fromUserId: string; toUserId: string }
  | { type: "notif:chat_request_rejected"; inviteId: string; fromUserId: string; toUserId: string }

  | { type: "notif:rejoin_request_created"; inviteId: string; conversationId: string; fromUserId: string; toUserId: string }
  | { type: "notif:rejoin_request_cancelled"; inviteId: string; conversationId: string; fromUserId: string; toUserId: string }
  | { type: "notif:rejoin_request_accepted"; inviteId: string; conversationId: string; fromUserId: string; toUserId: string }
  | { type: "notif:rejoin_request_rejected"; inviteId: string; conversationId: string; fromUserId: string; toUserId: string }

  | { type: "notif:contact_request_created"; inviteId: string; fromUserId: string; toUserId: string }
  | { type: "notif:contact_request_cancelled"; inviteId: string; fromUserId: string; toUserId: string }
  | { type: "notif:contact_request_accepted"; inviteId: string; fromUserId: string; toUserId: string }
  | { type: "notif:contact_request_rejected"; inviteId: string; fromUserId: string; toUserId: string }

  | { type: "notif:conversation_created"; conversationId: string; userIds: string[] }
  | { type: "notif:conversation_updated"; conversationId: string; userIds?: string[] }
  | { type: "notif:conversation_left"; conversationId: string; userId: string }

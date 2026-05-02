// VTM/lib/realtimeEvents.ts

export type PresenceRealtimeEvent = {
  type: "presence";
  userId: string;
  online: boolean;
  at?: string;
};

export type ChatRequestRealtimeEvent =
  | {
      type: "notif:chat_request_created";
      inviteId: string;
      fromUserId: string;
      toUserId: string;
    }
  | {
      type: "notif:chat_request_cancelled";
      inviteId: string;
      fromUserId: string;
      toUserId: string;
    }
  | {
      type: "notif:chat_request_accepted";
      inviteId: string;
      conversationId: string;
      fromUserId: string;
      toUserId: string;
    }
  | {
      type: "notif:chat_request_rejected";
      inviteId: string;
      fromUserId: string;
      toUserId: string;
    };

export type RejoinRequestRealtimeEvent =
  | {
      type: "notif:rejoin_request_created";
      inviteId: string;
      conversationId: string;
      fromUserId: string;
      toUserId: string;
    }
  | {
      type: "notif:rejoin_request_cancelled";
      inviteId: string;
      conversationId: string;
      fromUserId: string;
      toUserId: string;
    }
  | {
      type: "notif:rejoin_request_accepted";
      inviteId: string;
      conversationId: string;
      fromUserId: string;
      toUserId: string;
    }
  | {
      type: "notif:rejoin_request_rejected";
      inviteId: string;
      conversationId: string;
      fromUserId: string;
      toUserId: string;
    };

export type ContactRequestRealtimeEvent =
  | {
      type: "notif:contact_request_created";
      inviteId: string;
      fromUserId: string;
      toUserId: string;
    }
  | {
      type: "notif:contact_request_cancelled";
      inviteId: string;
      fromUserId: string;
      toUserId: string;
    }
  | {
      type: "notif:contact_request_accepted";
      inviteId: string;
      fromUserId: string;
      toUserId: string;
    }
  | {
      type: "notif:contact_request_rejected";
      inviteId: string;
      fromUserId: string;
      toUserId: string;
    };

export type ConversationRealtimeEvent =
  | {
      type: "notif:conversation_created";
      conversationId: string;
      userIds: string[];
    }
  | {
      type: "notif:conversation_updated";
      conversationId: string;
      userIds?: string[];
    }
  | {
      type: "notif:conversation_left";
      conversationId: string;
      userId: string;
    };

export type UserRealtimeEvent =
  | PresenceRealtimeEvent
  | ChatRequestRealtimeEvent
  | RejoinRequestRealtimeEvent
  | ContactRequestRealtimeEvent
  | ConversationRealtimeEvent
  | { type: "welcome"; userId?: string; roomId?: string }
  | { type: string; [key: string]: any };

export function isNotificationRealtimeEvent(evt: UserRealtimeEvent) {
  return typeof evt?.type === "string" && evt.type.startsWith("notif:");
}


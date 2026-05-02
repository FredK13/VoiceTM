import prisma from "../prismaClient";
import type { RealtimeEvent } from "./realtimeEvents";


export async function listPresenceWatcherUserIds(subjectUserId: string): Promise<string[]> {
  const [ownedContacts, reverseContacts, memberships] = await Promise.all([
    prisma.contact.findMany({
      where: { ownerId: subjectUserId },
      select: { contactId: true },
    }),
    prisma.contact.findMany({
      where: { contactId: subjectUserId },
      select: { ownerId: true },
    }),
    prisma.conversationMember.findMany({
      where: {
        userId: subjectUserId,
        leftAt: null,
      },
      select: { conversationId: true },
    }),
  ]);


  const convoIds = memberships.map((m) => m.conversationId);


  let partnerIds: string[] = [];
  if (convoIds.length) {
    const rows = await prisma.conversationMember.findMany({
      where: {
        conversationId: { in: convoIds },
        leftAt: null,
        userId: { not: subjectUserId },
      },
      select: { userId: true },
    });
    partnerIds = rows.map((r) => r.userId);
  }


  return Array.from(
    new Set([
      ...ownedContacts.map((r) => r.contactId),
      ...reverseContacts.map((r) => r.ownerId),
      ...partnerIds,
    ])
  );
}

function realtimeConfig() {
  const base = (process.env.REALTIME_INTERNAL_URL || "").trim().replace(/\/+$/, "");
  const secret = (process.env.WS_INTERNAL_BROADCAST_SECRET || "").trim();


  if (!base || !secret) {
    return null;
  }


  return { base, secret };
}


export async function publishRealtimeToRooms(params: {
  roomIds: string[];
  event: RealtimeEvent;
}) {
  const config = realtimeConfig();


  if (!config) {
    console.warn("Realtime fanout not configured");
    return;
  }


  const roomIds = Array.from(
    new Set(params.roomIds.map((x) => x.trim()).filter(Boolean))
  );


  if (!roomIds.length) return;


  try {
    const res = await fetch(`${config.base}/internal/broadcast`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-broadcast": config.secret,
      },
      body: JSON.stringify({
        roomIds,
        event: params.event,
      }),
    });


    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn("publishRealtimeToRooms non-ok response:", {
        status: res.status,
        body,
      });
    }
  } catch (err) {
    console.warn("publishRealtimeToRooms failed:", err);
  }
}


export async function publishRealtimeToUsers(params: {
  userIds: string[];
  event: RealtimeEvent;
}) {
  const roomIds = Array.from(
    new Set(
      params.userIds
        .filter(Boolean)
        .map((id) => `user:${id}`)
    )
  );


  return publishRealtimeToRooms({
    roomIds,
    event: params.event,
  });
}

export async function publishPresenceToUsers(params: {
  watcherUserIds: string[];
  subjectUserId: string;
  online: boolean;
  at?: string;
}) {
  return publishRealtimeToUsers({
    userIds: params.watcherUserIds,
    event: {
      type: "presence",
      userId: params.subjectUserId,
      online: params.online,
      at: params.at ?? new Date().toISOString(),
    },
  });
}




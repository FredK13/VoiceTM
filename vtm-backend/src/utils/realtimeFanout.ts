import prisma from "../prismaClient";


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


export async function publishPresenceToUsers(params: {
  watcherUserIds: string[];
  subjectUserId: string;
  online: boolean;
  at?: string;
}) {
  const base = (process.env.REALTIME_INTERNAL_URL || "").trim().replace(/\/+$/, "");
  const secret = (process.env.WS_INTERNAL_BROADCAST_SECRET || "").trim();


  if (!base || !secret) {
    console.warn("Realtime fanout not configured");
    return;
  }


  const roomIds = Array.from(
    new Set(
      params.watcherUserIds
        .filter(Boolean)
        .map((id) => `user:${id}`)
    )
  );


  if (!roomIds.length) return;


  try {
    const res = await fetch(`${base}/internal/broadcast`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-broadcast": secret,
      },
      body: JSON.stringify({
        roomIds,
        event: {
          type: "presence",
          userId: params.subjectUserId,
          online: params.online,
          at: params.at ?? new Date().toISOString(),
        },
      }),
    });


    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn("publishPresenceToUsers non-ok response:", {
        status: res.status,
        body,
      });
    }
  } catch (err) {
    console.warn("publishPresenceToUsers failed:", err);
  }
}



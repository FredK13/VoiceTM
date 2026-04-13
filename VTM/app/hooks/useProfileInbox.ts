import { useCallback, useMemo, useRef, useState } from "react";
import { apiJson } from "../../lib/api";
import type {
  IncomingInvite,
  OutgoingInvite,
  IncomingContactInvite,
  OutgoingContactInvite,
  IncomingRejoinInvite,
  OutgoingRejoinInvite,
  RecentlyLeftRow,
} from "../../lib/types";


type IncomingChatAny = IncomingInvite | IncomingRejoinInvite;
type OutgoingChatAny = OutgoingInvite | OutgoingRejoinInvite;


export type IncomingNotif =
  | { kind: "chat"; id: string; createdAt: string; user: { username: string }; raw: IncomingChatAny }
  | { kind: "contact"; id: string; createdAt: string; user: { username: string }; raw: IncomingContactInvite };


export type OutgoingNotif =
  | { kind: "chat"; id: string; createdAt: string; user: { username: string }; raw: OutgoingChatAny }
  | { kind: "contact"; id: string; createdAt: string; user: { username: string }; raw: OutgoingContactInvite };


type Args = {
  t: (key: string, options?: any) => string;
  refreshConversations: () => Promise<any>;
  refreshMe: () => Promise<void>;
};


export function useProfileInbox({ t, refreshConversations, refreshMe }: Args) {
  const [profileOpen, setProfileOpen] = useState(false);


  const [recentlyLeft, setRecentlyLeft] = useState<RecentlyLeftRow[]>([]);
  const [loadingRecentlyLeft, setLoadingRecentlyLeft] = useState(false);


  const [chatRequests, setChatRequests] = useState<(IncomingInvite | IncomingRejoinInvite)[]>([]);
  const [chatOutgoing, setChatOutgoing] = useState<(OutgoingInvite | OutgoingRejoinInvite)[]>([]);
  const [contactRequests, setContactRequests] = useState<IncomingContactInvite[]>([]);
  const [contactOutgoing, setContactOutgoing] = useState<OutgoingContactInvite[]>([]);


  const [loadingChatRequests, setLoadingChatRequests] = useState(false);
  const [loadingChatOutgoing, setLoadingChatOutgoing] = useState(false);
  const [loadingContactRequests, setLoadingContactRequests] = useState(false);
  const [loadingContactOutgoing, setLoadingContactOutgoing] = useState(false);


  const lastChatOutgoingCountRef = useRef<number>(0);


  const unifiedIncoming: IncomingNotif[] = useMemo(() => {
    const a: IncomingNotif[] = [
      ...chatRequests.map((inv: any) => ({
        kind: "chat" as const,
        id: inv.id,
        createdAt: inv.createdAt,
        user: { username: inv.fromUser?.username ?? t("common.unknownUser") },
        raw: inv as any,
      })),
      ...contactRequests.map((inv) => ({
        kind: "contact" as const,
        id: inv.id,
        createdAt: inv.createdAt,
        user: { username: inv.fromUser.username },
        raw: inv,
      })),
    ];


    a.sort((x, y) => Date.parse(y.createdAt) - Date.parse(x.createdAt));
    return a;
  }, [chatRequests, contactRequests, t]);


  const unifiedOutgoing: OutgoingNotif[] = useMemo(() => {
    const a: OutgoingNotif[] = [
      ...chatOutgoing.map((inv: any) => ({
        kind: "chat" as const,
        id: inv.id,
        createdAt: inv.createdAt,
        user: { username: inv.toUser?.username ?? t("common.unknownUser") },
        raw: inv as any,
      })),
      ...contactOutgoing.map((inv) => ({
        kind: "contact" as const,
        id: inv.id,
        createdAt: inv.createdAt,
        user: { username: inv.toUser.username },
        raw: inv,
      })),
    ];


    a.sort((x, y) => Date.parse(y.createdAt) - Date.parse(x.createdAt));
    return a;
  }, [chatOutgoing, contactOutgoing, t]);


  const loadingRequests = loadingChatRequests || loadingContactRequests;
  const loadingPending = loadingChatOutgoing || loadingContactOutgoing;


  const badgeCount =
    chatRequests.length + chatOutgoing.length + contactRequests.length + contactOutgoing.length;


  const refreshChatRequests = useCallback(async () => {
  setLoadingChatRequests(true);
  try {
    const [invites, rejoins] = await Promise.all([
      apiJson<IncomingInvite[]>("/api/conversations/requests"),
      apiJson<IncomingRejoinInvite[]>("/api/rejoin/requests"),
    ]);


    const safeInvites = Array.isArray(invites) ? invites : [];
    const safeRejoins = Array.isArray(rejoins) ? rejoins : [];


    setChatRequests([...(safeInvites as any[]), ...(safeRejoins as any[])] as any);
  } catch (err) {
    console.warn("Failed to load chat requests:", err);
    setChatRequests([]);
  } finally {
    setLoadingChatRequests(false);
  }
}, []);



  const refreshChatOutgoing = useCallback(async () => {
  setLoadingChatOutgoing(true);
  try {
    const [invites, rejoins] = await Promise.all([
      apiJson<OutgoingInvite[]>("/api/conversations/requests/outgoing"),
      apiJson<OutgoingRejoinInvite[]>("/api/rejoin/requests/outgoing"),
    ]);


    const safeInvites = Array.isArray(invites) ? invites : [];
    const safeRejoins = Array.isArray(rejoins) ? rejoins : [];


    const merged = ([...(safeInvites as any[]), ...(safeRejoins as any[])] as any[]);


    const prevCount = lastChatOutgoingCountRef.current;
    lastChatOutgoingCountRef.current = merged.length;


    setChatOutgoing(merged as any);


    if (merged.length < prevCount) {
      await refreshConversations();
    }
  } catch (err) {
    console.warn("Failed to load chat outgoing:", err);
    setChatOutgoing([]);
  } finally {
    setLoadingChatOutgoing(false);
  }
}, [refreshConversations]);





  const refreshContactRequests = useCallback(async () => {
  setLoadingContactRequests(true);
  try {
    const data = await apiJson<IncomingContactInvite[]>("/api/contacts/requests");
    setContactRequests(Array.isArray(data) ? data : []);
  } catch (err) {
    console.warn("Failed to load contact requests:", err);
    setContactRequests([]);
  } finally {
    setLoadingContactRequests(false);
  }
}, []);


  const refreshContactOutgoing = useCallback(async () => {
  setLoadingContactOutgoing(true);
  try {
    const data = await apiJson<OutgoingContactInvite[]>("/api/contacts/requests/outgoing");
    setContactOutgoing(Array.isArray(data) ? data : []);
  } catch (err) {
    console.warn("Failed to load contact outgoing:", err);
    setContactOutgoing([]);
  } finally {
    setLoadingContactOutgoing(false);
  }
}, []);



  const refreshRecentlyLeft = useCallback(async () => {
  setLoadingRecentlyLeft(true);
  try {
    const data = await apiJson<RecentlyLeftRow[]>("/api/rejoin/recently-left");
    setRecentlyLeft(Array.isArray(data) ? data : []);
  } catch (err) {
    console.warn("Failed to load recently left:", err);
    setRecentlyLeft([]);
  } finally {
    setLoadingRecentlyLeft(false);
  }
}, []);



  const openProfileAndRefresh = useCallback(async () => {
  setProfileOpen(true);
  await Promise.all([
    refreshMe(),
    refreshChatRequests(),
    refreshChatOutgoing(),
    refreshContactRequests(),
    refreshContactOutgoing(),
  ]);
}, [
  refreshMe,
  refreshChatRequests,
  refreshChatOutgoing,
  refreshContactRequests,
  refreshContactOutgoing,
]);



  const refreshAllProfileInbox = useCallback(async () => {
  await Promise.all([
    refreshMe(),
    refreshChatRequests(),
    refreshChatOutgoing(),
    refreshContactRequests(),
    refreshContactOutgoing(),
    refreshConversations(),
  ]);
}, [
  refreshMe,
  refreshChatRequests,
  refreshChatOutgoing,
  refreshContactRequests,
  refreshContactOutgoing,
  refreshConversations,
]);





  return {
    profileOpen,
    setProfileOpen,

    recentlyLeft,
    loadingRecentlyLeft,


    chatRequests,
    setChatRequests,
    chatOutgoing,
    setChatOutgoing,
    contactRequests,
    setContactRequests,
    contactOutgoing,
    setContactOutgoing,


    unifiedIncoming,
    unifiedOutgoing,


    loadingRequests,
    loadingPending,


    refreshChatRequests,
    refreshChatOutgoing,
    refreshContactRequests,
    refreshContactOutgoing,
    refreshRecentlyLeft,
    openProfileAndRefresh,
    refreshAllProfileInbox,


    badgeCount,
  };
}


export default useProfileInbox;


import React, { useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import type { TFunction } from "i18next";
import ProfileLauncher from "./ProfileLauncher";
import ProfileModal from "./ProfileModal";
import useProfileAvatar from "../hooks/useProfileAvatar";
import useProfileInbox from "../hooks/useProfileInbox";
import useRefreshOnFocus from "../hooks/useRefreshOnFocus";
import { apiFetch, apiJson } from "../../lib/api";
import type {
  IncomingContactInvite,
  IncomingInvite,
  IncomingRejoinInvite,
  RequestResponse,
} from "../../lib/types";
import type { OutgoingNotif } from "../hooks/useProfileInbox";
import RecentlyLeftModal from "./RecentlyLeftModal";


type Props = {
  t: TFunction;
  router: any;
  refreshConversations: () => Promise<any>;
  disabled?: boolean;
  onAcceptedConversation?: (conversationId: string) => Promise<void> | void;
  onOpenContacts?: () => void;
  openProfileSignal?: number;
  closeProfileSignal?: number;
  openRecentlyLeftSignal?: number;
  refreshProfileInboxSignal?: number;
};


export default function ProfileEntryPoint({
  t,
  router,
  refreshConversations,
  disabled = false,
  onAcceptedConversation,
  onOpenContacts,
  openProfileSignal = 0,
  closeProfileSignal = 0,
  openRecentlyLeftSignal = 0,
  refreshProfileInboxSignal = 0,
}: Props) {
  const {
    myAvatarUrl,
    myUsername,
    refreshMe,
    pickAndUploadAvatar,
    removeAvatar,
  } = useProfileAvatar({ t });
  


  const {
    profileOpen,
    setProfileOpen,
    recentlyLeft,
    loadingRecentlyLeft,
    setChatRequests,
    setContactRequests,
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
  } = useProfileInbox({
    t,
    refreshConversations,
    refreshMe,
  });


  useRefreshOnFocus(refreshAllProfileInbox);

    const [recentlyLeftOpen, setRecentlyLeftOpen] = useState(false);
    const lastOpenProfileSignalRef = useRef<number>(0);
    const lastCloseProfileSignalRef = useRef<number>(0);
    const handledOpenRecentlyLeftRef = useRef<number>(0);
    const handledRefreshProfileInboxRef = useRef<number>(0);

    useEffect(() => {
      if (!openProfileSignal) return;
      if (lastOpenProfileSignalRef.current === openProfileSignal) return;

      lastOpenProfileSignalRef.current = openProfileSignal;
        openProfileAndRefresh().catch(() => {});
    }, [openProfileSignal, openProfileAndRefresh]);

    useEffect(() => {
      if (!closeProfileSignal) return;
      if (lastCloseProfileSignalRef.current === closeProfileSignal) return;

      lastCloseProfileSignalRef.current = closeProfileSignal;
        setProfileOpen(false);
    }, [closeProfileSignal, setProfileOpen]);

    useEffect(() => {
      if (!openRecentlyLeftSignal) return;
      if (handledOpenRecentlyLeftRef.current === openRecentlyLeftSignal) return;
      
      handledOpenRecentlyLeftRef.current = openRecentlyLeftSignal;
        setRecentlyLeftOpen(true);
        refreshRecentlyLeft().catch(() => {});
    }, [openRecentlyLeftSignal, refreshRecentlyLeft]);

    useEffect(() => {
      if (!refreshProfileInboxSignal) return;
      if (handledRefreshProfileInboxRef.current === refreshProfileInboxSignal) return;

      handledRefreshProfileInboxRef.current = refreshProfileInboxSignal;
        refreshAllProfileInbox().catch(() => {});
    }, [refreshProfileInboxSignal, refreshAllProfileInbox]);


  async function acceptChatRequest(item: IncomingInvite | IncomingRejoinInvite | any) {
    try {
      let out: any = null;


      if ((item as any)?.kind === "rejoin") {
        out = await apiFetch(`/api/rejoin/requests/${item.id}/accept`, { method: "POST" });
      } else {
        out = await apiFetch(`/api/conversations/requests/${item.id}/accept`, { method: "POST" });
      }


      setChatRequests((prev) => prev.filter((r: any) => r.id !== item.id));
      await refreshChatOutgoing();


      const conversationId = (out as any)?.conversationId as string | undefined;


      if (conversationId) {
        setProfileOpen(false);


        if (onAcceptedConversation) {
          await onAcceptedConversation(conversationId);
        } else {
          router.push("/messages");
        }
      }
    } catch (err: any) {
      Alert.alert(t("common.acceptFailed"), err?.message ?? t("common.couldNotAccept"));
    }
  }


  async function rejectChatRequest(item: IncomingInvite | IncomingRejoinInvite | any) {
    try {
      if ((item as any)?.kind === "rejoin") {
        await apiFetch(`/api/rejoin/requests/${item.id}/reject`, { method: "POST" });
      } else {
        await apiFetch(`/api/conversations/requests/${item.id}/reject`, { method: "POST" });
      }
      setChatRequests((prev) => prev.filter((r: any) => r.id !== item.id));
    } catch (err: any) {
      Alert.alert(t("common.rejectFailed"), err?.message ?? t("common.couldNotReject"));
    }
  }


  async function acceptContactRequest(item: IncomingContactInvite) {
    try {
      await apiFetch(`/api/contacts/requests/${item.id}/accept`, { method: "POST" });
      setContactRequests((prev) => prev.filter((r) => r.id !== item.id));
      await refreshContactOutgoing();
      setProfileOpen(false);


      if (onOpenContacts) onOpenContacts();
      else router.push("/contacts");
    } catch (err: any) {
      Alert.alert(t("common.acceptFailed"), err?.message ?? t("common.couldNotAccept"));
    }
  }


  async function rejectContactRequest(item: IncomingContactInvite) {
    try {
      await apiFetch(`/api/contacts/requests/${item.id}/reject`, { method: "POST" });
      setContactRequests((prev) => prev.filter((r) => r.id !== item.id));
    } catch (err: any) {
      Alert.alert(t("common.rejectFailed"), err?.message ?? t("common.couldNotReject"));
    }
  }

  async function createConversationRequest(identifier: string) {
  const value = identifier.trim();
  if (!value) return;


  const res = await apiJson<RequestResponse>("/api/conversations/request", {
    method: "POST",
    json: { identifier: value },
  });


  if (res.status === "PENDING_ALREADY") {
    Alert.alert(t("common.pending"), t("common.currentRequestPending"));
    await refreshChatOutgoing();
    return;
  }


  if (res.status === "ALREADY_CONNECTED") {
    if (res.conversationId) {
      setProfileOpen(false);


      if (onAcceptedConversation) {
        await onAcceptedConversation(res.conversationId);
      } else {
        router.push("/messages");
      }
    }
    return;
  }


  if (res.status === "REJOIN_SENT") {
    await refreshChatOutgoing();


    Alert.alert(
      t("common.rejoinRequestSentTitle"),
      t("common.rejoinRequestSentBody"),
      [{ text: t("common.open"), onPress: () => openProfileAndRefresh().catch(() => {}) }]
    );
    return;
  }


  if (res.status === "INCOMING_PENDING") {
    await refreshChatRequests();


    Alert.alert(
      t("common.requestWaitingTitle"),
      t("common.requestWaitingBody"),
      [
        { text: t("common.open"), onPress: () => openProfileAndRefresh().catch(() => {}) },
        { text: t("common.cancel"), style: "cancel" },
      ]
    );
    return;
  }


  await refreshChatOutgoing();


  Alert.alert(
    t("common.sent"),
    t("common.requestSent"),
    [{ text: t("common.okay"), onPress: () => openProfileAndRefresh().catch(() => {}) }]
  );
}

  async function cancelPendingRequest(item: OutgoingNotif) {
    try {
      if (item.kind === "chat") {
        const raw = item.raw as any;


        if (raw?.kind === "rejoin") {
          await apiFetch(`/api/rejoin/requests/${item.id}/cancel`, { method: "POST" });
        } else {
          await apiFetch(`/api/conversations/requests/${item.id}/cancel`, { method: "POST" });
        }


        await refreshChatOutgoing();
        await refreshChatRequests();
        return;
      }


      await apiFetch(`/api/contacts/requests/${item.id}/cancel`, { method: "POST" });
      await refreshContactOutgoing();
      await refreshContactRequests();
    } catch (err: any) {
      Alert.alert(t("common.errorTitle"), err?.message ?? t("errors.requestFailed"));
    }
  }


  return (
    <>
      <ProfileLauncher
        avatarUrl={myAvatarUrl}
        username={myUsername}
        badgeCount={badgeCount}
        disabled={disabled}
        onPress={() => openProfileAndRefresh().catch(() => {})}
      />


      <ProfileModal
        visible={profileOpen}
        onClose={() => setProfileOpen(false)}
        t={t}
        myUsername={myUsername}
        myAvatarUrl={myAvatarUrl}
        unifiedIncoming={unifiedIncoming}
        unifiedOutgoing={unifiedOutgoing}
        loadingRequests={loadingRequests}
        loadingPending={loadingPending}
        onRefreshRequests={() => {
          refreshChatRequests().catch(() => {});
          refreshContactRequests().catch(() => {});
        }}
        onRefreshPending={() => {
          refreshChatOutgoing().catch(() => {});
          refreshContactOutgoing().catch(() => {});
        }}
        onAcceptChatRequest={acceptChatRequest}
        onRejectChatRequest={rejectChatRequest}
        onAcceptContactRequest={acceptContactRequest}
        onRejectContactRequest={rejectContactRequest}
        onCancelPending={cancelPendingRequest}
        onPickAndUploadAvatar={() => {
          pickAndUploadAvatar().catch(() => {});
        }}
        onRemoveAvatar={() => {
          removeAvatar().catch(() => {});
        }}
        onOpenContacts={() => {
          setProfileOpen(false);
          if (onOpenContacts) onOpenContacts();
          else router.push("/contacts");
        }}
      />
      
      
      <RecentlyLeftModal
        visible={recentlyLeftOpen}
        onClose={() => setRecentlyLeftOpen(false)}
        t={t}
        recentlyLeft={recentlyLeft}
        loadingRecentlyLeft={loadingRecentlyLeft}
        onRefreshRecentlyLeft={() => {
          refreshRecentlyLeft().catch(() => {});
        }}
        onPressRecentlyLeftUser={(item) => {
          const username = (item.otherUsername || "").trim();
          if (!username) return;

          setRecentlyLeftOpen(false);

          setTimeout(() => {
          Alert.alert(
            t("common.rejoinPromptTitle"),
            t("common.rejoinPromptBody", { username }),
          [
            { text: t("common.cancel"), style: "cancel" },
            {
              text: t("common.send"),
                onPress: async () => {
                try {
                  await createConversationRequest(username);
                } catch (err: any) {
                    console.warn("Failed to send rejoin request:", err);
                  Alert.alert(
                    t("common.couldNotSendTitle"),
                    err?.message ?? t("common.serverError")
                  );
                }
              },
            },
          ]
        );
      }, 0);
    }}
  />
    </>
  );
}

import React, { useEffect, useRef } from "react";
import { Alert } from "react-native";
import type { TFunction } from "i18next";
import ProfileLauncher from "./ProfileLauncher";
import ProfileModal from "./ProfileModal";
import useProfileAvatar from "../hooks/useProfileAvatar";
import useProfileInbox from "../hooks/useProfileInbox";
import useRefreshOnFocus from "../hooks/useRefreshOnFocus";
import { apiFetch } from "../../lib/api";
import type {
  IncomingContactInvite,
  IncomingInvite,
  IncomingRejoinInvite,
} from "../../lib/types";
import type { OutgoingNotif } from "../hooks/useProfileInbox";


type Props = {
  t: TFunction;
  router: any;
  refreshConversations: () => Promise<any>;
  disabled?: boolean;
  onAcceptedConversation?: (conversationId: string) => Promise<void> | void;
  onOpenContacts?: () => void;
  openProfileSignal?: number;
  closeProfileSignal?: number;
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
    openProfileAndRefresh,
    refreshAllProfileInbox,
    badgeCount,
  } = useProfileInbox({
    t,
    refreshConversations,
    refreshMe,
  });


  useRefreshOnFocus(refreshAllProfileInbox);

   const lastOpenProfileSignalRef = useRef<number>(0);
   const lastCloseProfileSignalRef = useRef<number>(0);

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
    </>
  );
}

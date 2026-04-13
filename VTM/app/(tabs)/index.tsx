// app/index.tsx
import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { apiFetch } from "@/lib/api";

import LanguageDropdown from "../components/LanguageDropdown";
import ProfileLauncher from "../components/ProfileLauncher";
import ProfileModal from "../components/ProfileModal";
import useProfileAvatar from "../hooks/useProfileAvatar";
import useProfileInbox from "../hooks/useProfileInbox";
import useRefreshOnFocus from "../hooks/useRefreshOnFocus";

export default function HomeScreen() {
  const router = useRouter();

  const { t } = useTranslation();

  const refreshConversations = async () => [];

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

  async function acceptChatRequest(item: any) {
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
      router.push("/messages");
    }
  } catch (err: any) {
    Alert.alert(t("common.acceptFailed"), err?.message ?? t("common.couldNotAccept"));
  }
}


async function rejectChatRequest(item: any) {
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


async function acceptContactRequest(item: any) {
  try {
    await apiFetch(`/api/contacts/requests/${item.id}/accept`, { method: "POST" });
    setContactRequests((prev) => prev.filter((r: any) => r.id !== item.id));
    await refreshContactOutgoing();
    setProfileOpen(false);
    router.push("/contacts");
  } catch (err: any) {
    Alert.alert(t("common.acceptFailed"), err?.message ?? t("common.couldNotAccept"));
  }
}


async function rejectContactRequest(item: any) {
  try {
    await apiFetch(`/api/contacts/requests/${item.id}/reject`, { method: "POST" });
    setContactRequests((prev) => prev.filter((r: any) => r.id !== item.id));
  } catch (err: any) {
    Alert.alert(t("common.rejectFailed"), err?.message ?? t("common.couldNotReject"));
  }
}


async function cancelPendingRequest(item: any) {
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
    Alert.alert(
      t("common.errorTitle"),
      err?.message ?? t("errors.requestFailed")
    );
  }
}

  return (
    <View style={styles.container}>
      {/* Language dropdown (upper-left) */}
      <View style={styles.langWrapper}>
        <LanguageDropdown />
      </View>

      <ProfileLauncher
  avatarUrl={myAvatarUrl}
  username={myUsername}
  badgeCount={badgeCount}
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
    router.push("/contacts");
  }}
/>

      {/* bottom-left Messages bubble */}
      <TouchableOpacity style={styles.homeBubbleWrapper} onPress={() => router.push("/messages")} activeOpacity={0.85}>
        <LinearGradient colors={["rgba(255,255,255,0.9)", "rgba(180,220,255,0.5)"]} style={styles.navBubble}>
          <Text style={{ fontSize: 24 }}>{"💬"}</Text>
        </LinearGradient>
      </TouchableOpacity>

      {/* bottom-right Settings bubble */}
      <TouchableOpacity style={styles.settingsBubbleWrapper} onPress={() => router.push("/settings")} activeOpacity={0.85}>
        <LinearGradient colors={["rgba(255,255,255,0.9)", "rgba(180,220,255,0.5)"]} style={styles.navBubble}>
          <Text style={{ fontSize: 24 }}>{"⚙️"}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ff0015ff",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },

  // upper-left language dropdown wrapper
  langWrapper: {
    position: "absolute",
    top: 50,
    left: 20,
    zIndex: 60,
  },

  // bottom nav bubbles
  navBubble: {
    width: 60,
    height: 60,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
  },
  homeBubbleWrapper: {
    position: "absolute",
    left: 40,
    bottom: 35,
    zIndex: 10,
  },
  settingsBubbleWrapper: {
    position: "absolute",
    right: 40,
    bottom: 35,
    zIndex: 10,
  },
});


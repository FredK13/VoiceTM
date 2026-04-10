// app/(tabs)/messages.tsx
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { apiFetch, apiJson, API_BASE, isApiError} from "../../lib/api";
import { getUserId } from "../../lib/session";
import { useTranslation } from "react-i18next";
import type {
  Conversation,
  IncomingInvite,
  RequestResponse,
  IncomingContactInvite,
  IncomingRejoinInvite,
} from "../../lib/types";

import {
  sendJson,
  isWsOpen,
} from "../../lib/realtime";
import { usePresence } from "../../lib/presence";
import ProfileLauncher from "../components/ProfileLauncher";
import ProfileModal from "../components/ProfileModal";
import useProfileInbox from "../hooks/useProfileInbox";
import useProfileAvatar from "../hooks/useProfileAvatar";
import RecentlyLeftModal from "../components/RecentlyLeftModal";
import StarredModal from "../components/StarredModal";
import ExtrasModal from "../components/ExtrasModal";
import FloatingConversationField, { type MovingBubble} from "../components/FloatingConversationField";
import ChatOverlay, { type ChatOverlayMessage } from "../components/ChatOverlay";
import useChatAudio from "../hooks/useChatAudio";
import useConversationRealtime from "../hooks/useConversationRealtime";


const { height } = Dimensions.get("window");


const INPUT_OFFSET = Platform.OS === "ios" ? 8 : 4;

type ChatMessage = ChatOverlayMessage;


// ---------- WS payloads ----------
type WsMsgNew = {
  type: "msg:new";
  convoId: string;
  messageId: string;
  senderId: string;
  createdAt?: string;
};

function uniqByIdKeepOrder<T extends { id: string }>(arr: T[]) {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of arr) {
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    out.push(it);
  }
  return out;
}

// Start here#
export default function MessagesScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  const [nowMs, setNowMs] = useState(() => Date.now());
  const [myUserId, setMyUserId] = useState<string | null>(null);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);


  const [recentlyLeftOpen, setRecentlyLeftOpen] = useState(false);
  const [starredOpen, setStarredOpen] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState(false);

  
  const presenceClockRef = useRef<any>(null);

  const { isUserOnline, } = usePresence();


  async function refreshConversations() {
    const data = await apiJson<Conversation[]>("/api/conversations");

    setConversations(data);
    return data;
  }

  
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

const {
  wsRef,
  otherTyping,
  presenceMap,
  disconnectWs,
} = useConversationRealtime({
  activeConversationId: activeConversation?.id ?? null,
  myUserId,
  draft,
  setConversations,
  setChatMessages,
});


const {
  playingMessageId,
  stopCurrentAudio,
  playMessageAudio,
} = useChatAudio({
  activeConversationId: activeConversation?.id ?? null,
  myUserId,
  getWs: () => wsRef.current,
  setChatMessages,
});




  useEffect(() => {
    getUserId()
      .then((id) => setMyUserId(id))
      .catch(() => setMyUserId(null));
  }, []);

  useEffect(() => {
  presenceClockRef.current = setInterval(() => {
    setNowMs(Date.now());
  }, 1000);


  return () => {
    if (presenceClockRef.current) clearInterval(presenceClockRef.current);
  };
}, []);


  useEffect(() => {
  let cancelled = false;
  (async () => {
    try {
      setLoading(true);
      setLoadingError(null);


      await refreshAllProfileInbox();


      if (cancelled) return;
    } catch (err: any) {
      console.warn("Initial load failed:", err);
      if (!cancelled) {
        setLoadingError(err?.message ?? t("common.failedToLoad"));
        setConversations([]);
      }
    } finally {
      if (!cancelled) setLoading(false);
    }
  })();


  return () => {
    cancelled = true;
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);


  // Keyboard
  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";


    const showSub = Keyboard.addListener(showEvent, (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));


    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  async function openConversationById(conversationId: string) {
    const data = await refreshConversations();
    const convo = conversations.find((c) => c.id === conversationId) ?? data.find((c) => c.id === conversationId);
      if (!convo) return;

    setProfileOpen(false);
    await stopCurrentAudio();
    await handleBubblePress(convo);

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
      await openConversationById(res.conversationId);
      return;
    }

    if (res.status === "REJOIN_SENT") {
  Alert.alert(
    t("common.rejoinRequestSentTitle"),
    t("common.rejoinRequestSentBody"),
    [{ text: t("common.open"), onPress: () => openProfileAndRefresh().catch(() => {}) }]
  );
  await refreshChatOutgoing();
  return;
}


    if (res.status === "INCOMING_PENDING") {
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


    Alert.alert(t("common.sent"), t("common.requestSent"));
    await refreshChatOutgoing();
  }


  function handleYapPress() {
    if (Platform.OS === "ios") {
      Alert.prompt(
        t("common.yap"),
        t("common.enterUsernameOrEmailToRequest"),
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("common.sendRequest"),
            onPress: (value?: string) => {
              const identifier = (value ?? "").trim();
              if (!identifier) return;
              createConversationRequest(identifier).catch((err) => {
                console.warn("Failed to send request:", err);
                Alert.alert(t("common.couldNotSendTitle"), err?.message ?? t("common.serverError"));
              });
            },
          },
        ],
        "plain-text"
      );
    } else {
      Alert.alert(t("common.androidTitle"), t("common.androidEmailModalSoon"));
    }
  }

  async function handleDeleteConversation(bubble: Conversation | MovingBubble) {
  try {
    await stopCurrentAudio().catch(() => {});


    await apiFetch(`/api/conversations/${bubble.id}`, {
      method: "DELETE",
    });


    setConversations((prev) => prev.filter((c) => c.id !== bubble.id));


    if (activeConversation?.id === bubble.id) {
      setActiveConversation(null);
      setChatMessages([]);
      setDraft("");
      disconnectWs();
    }
  } catch (err: any) {
    Alert.alert(
      t("common.errorTitle"),
      err?.message ?? t("common.couldNotDeleteChat")
    );
  }
}

  function handleBubbleLongPress(bubble: Conversation | MovingBubble) {
    Alert.alert(
      bubble.title,
      t("common.deleteThisChat"),
      [
        { text: t("common.delete"), style: "destructive", onPress: () => handleDeleteConversation(bubble) },
        { text: t("common.cancel"), style: "cancel" },
      ],
      { cancelable: true }
    );
  }


  async function handleBubblePress(bubble: Conversation | MovingBubble) {
    setActiveConversation(bubble);
    setChatMessages([]);
    setDraft("");


    try {
      const raw = await apiJson<any[]>(`/api/conversations/${bubble.id}/messages`);
      const msgs: ChatMessage[] = Array.isArray(raw)
        ? raw.map((m: any) => {
          const streamUrl = m.audioUrl ? `${API_BASE}/api/messages/${m.id}/audio` : null;
          const senderId = String(m.senderId ?? "");

          const readAt = m.readAt ?? null;
          const listenedAt = m.listenedAt ?? null;

          const isMine = !!myUserId && senderId === myUserId;
 
          return {
            id: String(m.id),
            senderId,
            isMine,
            text: String(m.text ?? ""),
            createdAt: m.createdAt,
            audioUrl: streamUrl,
            audioDurationMs: m.audioDurationMs ?? null,

            // ✅ persist fields from backend
             readAt,
            listenedAt,

            // ✅ show MY receipts based on persisted DB values
            receipt: isMine ? (listenedAt ? "listened" : "posted") : undefined,
          } as ChatMessage;
          })
        : [];


      // Ensure unique + stable order
      const unique = uniqByIdKeepOrder(msgs);
      unique.sort((a, b) => {
        const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
        const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
        return ta - tb;
      });


      setChatMessages(unique);


      const newestUnread = [...unique]
  .filter((m) => !m.isMine && !!m.audioUrl && !m.listenedAt)
  .sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    return ta - tb;
  })
  .pop();


  if (newestUnread) playMessageAudio(newestUnread, bubble.id, true);
  } catch (err) {
      console.warn("Failed to load messages:", err);
      setChatMessages([]);
    }
  }


  async function handleSend() {
    if (!draft.trim() || !activeConversation) return;


    const convoId = activeConversation.id;
    const text = draft.trim();
    const tempId = `tmp:${Date.now().toString()}`;


    const optimisticMessage: ChatMessage = {
      id: tempId,
      senderId: myUserId ?? "me",
      isMine: true,
      text,
      receipt: "posted", // shown only after real ID swap, but safe
    };


    setChatMessages((prev) => [...prev, optimisticMessage]);
    setDraft("");


    setConversations((prev) => prev.map((c) => (c.id === convoId ? { ...c, lastMessage: text } : c)));


    try {
      const saved = await apiJson<any>(`/api/conversations/${convoId}/messages`, {
        method: "POST",
        json: { text },
      });


      const savedId = String(saved.id);
      const senderId = String(saved.senderId ?? myUserId ?? "me");
      const streamUrl = saved.audioUrl ? `${API_BASE}/api/messages/${savedId}/audio` : null;


      const finalMsg: ChatMessage = {
        id: savedId,
        senderId,
        isMine: !!myUserId && senderId === myUserId,
        text: String(saved.text ?? text),
        createdAt: saved.createdAt,
        audioUrl: streamUrl,
        audioDurationMs: saved.audioDurationMs ?? null,
        readAt: saved.readAt ?? null,
        receipt: "posted",
      };


      // Replace optimistic temp message
      setChatMessages((prev) => {
        const next = prev.map((m) => (m.id === tempId ? finalMsg : m));
        next.sort((a, b) => {
          const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
          const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
          return ta - tb;
        });
        return next;
      });


      // ✅ Broadcast to room so other device gets it instantly
      const ws = wsRef.current;
      if (ws && isWsOpen(ws)) {
        

      sendJson(ws, {
        type: "msg:new",
        convoId,
        messageId: savedId,
        senderId,
        createdAt: finalMsg.createdAt,
      } satisfies WsMsgNew);
      }


    } catch (err: any) {
      console.warn("Failed to send message:", err);

       // Remove optimistic message on failure
  setChatMessages((prev) => prev.filter((m) => m.id !== tempId));

  // ✅ If backend says rejoin is pending, open Profile and show Pending/Requests
  if (isApiError(err)) {
    const payload = err.payload;


if (payload?.code === "REJOIN_PENDING") {
  // ✅ close chat overlay so it doesn't look weird
  await stopCurrentAudio().catch(() => {});
  setActiveConversation(null);
  setChatMessages([]);
  setDraft("");


  // optional: also disconnect ws immediately (nice cleanup)
  disconnectWs?.();


  // ✅ open profile + refresh
  await openProfileAndRefresh().catch(() => {});


  Alert.alert(
  t("common.rejoinPendingTitle"),
  payload?.action === "OPEN_PENDING" 
    ? t("common.rejoinPendingOpenPending")
    : t("common.rejoinPendingOpenRequests"),
  [{ text: t("common.okay") }]
  );

  return;
}

  }

      Alert.alert(t("common.sendFailed"), err?.message ?? t("common.couldNotSend"));
    }
  }


// Request action handlers stay here for now because they coordinate
// screen-local UI concerns: alerts, navigation, modal state, and chat opening.
// Chat invites: Accept (normal + rejoin)
async function acceptChatRequest(item: IncomingInvite | IncomingRejoinInvite | any) {
  try {
    let out: any = null;


    // ✅ Rejoin invite accept
    if ((item as any)?.kind === "rejoin") {
      out = await apiFetch(`/api/rejoin/requests/${item.id}/accept`, { method: "POST" });
    } else {
      // ✅ Normal invite accept
      out = await apiFetch(`/api/conversations/requests/${item.id}/accept`, { method: "POST" });
    }


    setChatRequests((prev) => prev.filter((r: any) => r.id !== item.id));
    await refreshChatOutgoing();


    const conversationId = (out as any)?.conversationId as string | undefined;


    if (conversationId) {
      Alert.alert(t("common.accepted"), t("common.openingChat"));
      await openConversationById(conversationId);
    } else {
      // fallback safety
      await refreshConversations();
      Alert.alert(t("common.accepted"), t("common.chatAvailable"));
    }
  } catch (err: any) {
    Alert.alert(t("common.acceptFailed"), err?.message ?? t("common.couldNotAccept"));
  }
}


  async function rejectChatRequest(item: IncomingInvite | IncomingRejoinInvite | any) {
  try {
    // ✅ Rejoin invite reject
    if ((item as any)?.kind === "rejoin") {
      await apiFetch(`/api/rejoin/requests/${item.id}/reject`, { method: "POST" });
      setChatRequests((prev) => prev.filter((r: any) => r.id !== item.id));
      return;
    }


    // ✅ Normal invite reject
    await apiFetch(`/api/conversations/requests/${item.id}/reject`, { method: "POST" });
    setChatRequests((prev) => prev.filter((r: any) => r.id !== item.id));
  } catch (err: any) {
    Alert.alert(t("common.rejectFailed"), err?.message ?? t("common.couldNotReject"));
  }
}


  // Contact invites: Add/Deny + redirect to Contacts after Add
  async function acceptContactRequest(reqItem: IncomingContactInvite) {
    try {
      await apiFetch(`/api/contacts/requests/${reqItem.id}/accept`, { method: "POST" });
      setContactRequests((prev) => prev.filter((r) => r.id !== reqItem.id));
      await refreshContactOutgoing();
      setProfileOpen(false);
      router.push("/contacts");
    } catch (err: any) {
      Alert.alert(t("common.acceptFailed"), err?.message ?? t("common.couldNotAccept"));
    }
  }


  async function rejectContactRequest(reqItem: IncomingContactInvite) {
    try {
      await apiFetch(`/api/contacts/requests/${reqItem.id}/reject`, { method: "POST" });
      setContactRequests((prev) => prev.filter((r) => r.id !== reqItem.id));
    } catch (err: any) {
      Alert.alert(t("common.rejectFailed"), err?.message ?? t("common.couldNotReject"));
    }
  }


  // Compute a simple "is the other user online?" from room presence
  const otherUserId = activeConversation?.otherUserId ?? null;
  const otherOnline = otherUserId ? !!presenceMap[otherUserId] : false;


  return (
    <View style={styles.container}>
      {loading && (
        <View style={styles.statusBar}>
          <Text style={styles.statusText}>{t("common.loadingConversations")}</Text>
        </View>
      )}
      {!loading && loadingError && (
        <View style={styles.statusBar}>
          <Text style={styles.statusText}>
            {t("common.errorPrefix")} {loadingError}
          </Text>
        </View>
      )}


<View style={styles.leftRail} pointerEvents={activeConversation ? "none" : "auto"}>
  <TouchableOpacity
    activeOpacity={0.85}
    style={styles.railBtn}
    onPress={() => {
      setRecentlyLeftOpen(true);
      refreshRecentlyLeft().catch(() => {});
    }}
  >
    <Text style={styles.railBtnText}>⏱️</Text>
  </TouchableOpacity>


  <TouchableOpacity
    activeOpacity={0.85}
    style={styles.railBtn}
    onPress={() => setStarredOpen(true)}
  >
    <Text style={styles.railBtnText}>⭐</Text>
  </TouchableOpacity>


  <TouchableOpacity
    activeOpacity={0.85}
    style={styles.railBtn}
    onPress={() => setExtrasOpen(true)}
  >
    <Text style={styles.railBtnText}>🧩</Text>
  </TouchableOpacity>
</View>


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
                await refreshChatOutgoing();
                await refreshChatRequests();
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

<StarredModal
  visible={starredOpen}
  onClose={() => setStarredOpen(false)}
  t={t}
/>

<ExtrasModal
  visible={extrasOpen}
  onClose={() => setExtrasOpen(false)}
  t={t}
/>

      {/* Profile circle button */}
      <ProfileLauncher
  avatarUrl={myAvatarUrl}
  username={myUsername}
  badgeCount={badgeCount}
  disabled={!!activeConversation}
  onPress={() => openProfileAndRefresh().catch(() => {})}
/>

<FloatingConversationField
  conversations={conversations}
  disabled={!!activeConversation}
  nowMs={nowMs}
  isUserOnline={isUserOnline}
  onPressBubble={(bubble) => {
    handleBubblePress(bubble).catch(() => {});
  }}
  onLongPressBubble={(bubble) => {
    handleBubbleLongPress(bubble);
  }}
/>

      {/* Yap button */}
      <View style={styles.yapButtonWrapper} pointerEvents={activeConversation ? "none" : "auto"}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handleYapPress}
          style={styles.yapButtonTouchable}
          hitSlop={{ top: 10, bottom: 10, left: 20, right: 20 }}
        >
          <LinearGradient colors={["#00d13b", "#00a82f"] as const} style={styles.yapButtonInner}>
            <Text style={styles.yapButtonText}>{t("common.yap")}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>


      {/* Nav bubbles */}
      <TouchableOpacity style={styles.homeBubbleWrapper} onPress={() => router.push("/")} activeOpacity={0.85}>
        <LinearGradient colors={["rgba(255,255,255,0.9)", "rgba(180,220,255,0.5)"] as const} style={styles.navBubble}>
          <Text style={{ fontSize: 24 }}>🏠</Text>
        </LinearGradient>
      </TouchableOpacity>


      <TouchableOpacity style={styles.settingsBubbleWrapper} onPress={() => router.push("/settings")} activeOpacity={0.85}>
        <LinearGradient colors={["rgba(255,255,255,0.9)", "rgba(180,220,255,0.5)"] as const} style={styles.navBubble}>
          <Text style={{ fontSize: 24 }}>⚙️</Text>
        </LinearGradient>
      </TouchableOpacity>


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

      <ChatOverlay
  visible={!!activeConversation}
  activeConversation={activeConversation}
  chatMessages={chatMessages}
  draft={draft}
  keyboardHeight={keyboardHeight}
  inputOffset={INPUT_OFFSET}
  otherTyping={otherTyping}
  otherOnline={otherOnline}
  playingMessageId={playingMessageId}
  t={t}
  onBack={() => {
    stopCurrentAudio()
      .then(() => setActiveConversation(null))
      .catch(() => setActiveConversation(null));
  }}
  onChangeDraft={setDraft}
  onSend={() => {
    handleSend().catch(() => {});
  }}
  onPlayMessage={(item) => {
    playMessageAudio(item, activeConversation?.id ?? undefined).catch(() => {});
  }}
/>

    </View>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ff0015ff" },


  statusBar: { 
    position: "absolute", 
    top: 8, 
    left: 0, 
    right: 0, 
    alignItems: "center", 
    zIndex: 5 
  },

  statusText: { 
    color: "#ffffff", 
    fontSize: 12 
  },

  yapButtonWrapper: { 
    position: "absolute", 
    bottom: 40, 
    left: 0, 
    right: 0, 
    alignItems: "center", 
    zIndex: 20 
  },

  yapButtonTouchable: { 
    position: "relative" 
  },

  yapButtonInner: {
    width: 85,
    height: 45,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 10,
  },

  yapButtonText: { color: "#ffffff", 
    fontSize: 18, 
    fontWeight: "700" 
  },


  navBubble: { 
    width: 60, 
    height: 60, 
    borderRadius: 29, 
    alignItems: "center", 
    justifyContent: "center" 
  },

  homeBubbleWrapper: { 
    position: "absolute", 
    left: 40, 
    bottom: 35, 
    zIndex: 25 
  },

  settingsBubbleWrapper: { 
    position: "absolute", 
    right: 40, 
    bottom: 35, 
    zIndex: 25 
  },


  leftRail: { 
    position: "absolute", 
    left: 16, 
    top: height * 0.23, 
    zIndex: 28, 
    gap: 16, 
  },

  railBtn: { 
    width: 54, 
    height: 54, 
    borderRadius: 999, 
    alignItems: "center", 
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)", 
    borderWidth: 1, borderColor: "rgba(255,255,255,0.35)", 
  },
    
  railBtnText: { 
    fontSize: 22,
  },

});
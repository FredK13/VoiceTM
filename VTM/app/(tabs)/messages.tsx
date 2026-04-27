// app/(tabs)/messages.tsx
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState, useMemo } from "react";
import {
  Alert,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { apiFetch, apiJson, isApiError} from "../../lib/api";
import { getUserId } from "../../lib/session";
import { useTranslation } from "react-i18next";
import type { Conversation } from "../../lib/types";
import {
  sendJson,
  isWsOpen,
} from "../../lib/realtime";
import { usePresence } from "../../lib/presence";
import FakeBubbleModal from "../components/FakeBubbleModal";
import ExtrasModal from "../components/ExtrasModal";
import FloatingConversationField from "../components/FloatingConversationField";
import type { MovingBubble } from "../components/FloatingConversationField";
import type { BubbleObstacle } from "../../lib/bubblePhysics";
import ChatOverlay, { type ChatOverlayMessage } from "../components/ChatOverlay";
import useConversationRequestFlow from "../hooks/useConversationRequestFlow";
import useChatAudio from "../hooks/useChatAudio";
import useConversationRealtime from "../hooks/useConversationRealtime";
import { mapApiMessageToChatMessage, sortChatMessagesByCreatedAt } from "../../lib/chatMessageMapper";
import ProfileEntryPoint from "../components/ProfileEntryPoint";
import { useLocalSearchParams } from "expo-router";
import useBubbles from "../hooks/useBubbles";


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
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const [nowMs, setNowMs] = useState(() => Date.now());
  const [myUserId, setMyUserId] = useState<string | null>(null);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  const [starredOpen, setStarredOpen] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [openProfileSignal, setOpenProfileSignal] = useState(0);
  const [closeProfileSignal, setCloseProfileSignal] = useState(0);
  const [openRecentlyLeftSignal, setOpenRecentlyLeftSignal] = useState(0);
  const [refreshProfileInboxSignal, setRefreshProfileInboxSignal] = useState(0);

  const params = useLocalSearchParams<{ 
    openConversationId?: string;
    openProfile?: string;
  }>();

  const openConversationId =
    typeof params.openConversationId === "string" ? params.openConversationId : null;

  const openProfile = 
    typeof params.openProfile === "string" ? params.openProfile : null;

  const handledOpenConversationIdRef = useRef<string | null>(null);
  const handledOpenProfileRef = useRef<string | null>(null);

  
  const presenceClockRef = useRef<any>(null);

  const { isUserOnline, } = usePresence();


  const OB_PAD = 4;
  const NAV_SIZE = 60;
  const RAIL_SIZE = 54;
  const YAP_W = 85;
  const YAP_H = 45;
  const PROFILE_SIZE = 60;


  const bubbleObstacles: BubbleObstacle[] = useMemo(
    () => [
      {
        x: 16 - OB_PAD,
        y: screenHeight * 0.23 - OB_PAD,
        width: RAIL_SIZE + OB_PAD * 2,
        height: RAIL_SIZE * 3 + 16 * 2 + OB_PAD * 2,
      },
      {
        x: screenWidth - 16 - PROFILE_SIZE - OB_PAD,
        y: 52 - OB_PAD,
        width: PROFILE_SIZE + OB_PAD * 2,
        height: PROFILE_SIZE + OB_PAD * 2,
      },
      {
        x: 40 - OB_PAD,
        y: screenHeight - 35 - NAV_SIZE - OB_PAD,
        width: NAV_SIZE + OB_PAD * 2,
        height: NAV_SIZE + OB_PAD * 2,
      },
      {
        x: screenWidth - 40 - NAV_SIZE - OB_PAD,
        y: screenHeight - 35 - NAV_SIZE - OB_PAD,
        width: NAV_SIZE + OB_PAD * 2,
        height: NAV_SIZE + OB_PAD * 2,
      },
      {
        x: screenWidth / 2 - YAP_W / 2 - OB_PAD,
        y: screenHeight - 40 - YAP_H - OB_PAD,
        width: YAP_W + OB_PAD * 2,
        height: YAP_H + OB_PAD * 2,
      },
    ],
    [screenWidth, screenHeight]
  );


  async function refreshConversations() {
    const data = await apiJson<Conversation[]>("/api/conversations");

    setConversations(data);
    return data;
  }


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

const {
  allBubbles,
  fakeBubbles,
  addFakeBubble,
  removeFakeBubble,
} = useBubbles({
  conversations,
  obstacles: bubbleObstacles,
  disabled: false,
  screenHeight,
  screenWidth,
});

function clearMessagesRouteParams() {
  router.replace("/messages");
}

useEffect(() => {
  if (!openConversationId) return;
  if (loading) return;
  if (handledOpenConversationIdRef.current === openConversationId) return;


  handledOpenConversationIdRef.current = openConversationId;


  openConversationById(openConversationId)
  .then(() => {
    clearMessagesRouteParams();
  })
  .catch((err) => {
    console.warn("Failed to open conversation from route param:", err);
  });
}, [openConversationId, loading, router]);

useEffect(() => {
  if (!openConversationId) {
    handledOpenConversationIdRef.current = null;
  }
}, [openConversationId]);

  useEffect(() => {
  if (!openProfile) return;
  if (loading) return;
  if (handledOpenProfileRef.current === openProfile) return;


  handledOpenProfileRef.current = openProfile;


  requestOpenProfileModal();
  clearMessagesRouteParams();
}, [openProfile, loading, router]);


useEffect(() => {
  if (!openProfile) {
    handledOpenProfileRef.current = null;
  }
}, [openProfile]);




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

      await refreshConversations();

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
    const convo =
      data.find((c) => c.id === conversationId) ??
      conversations.find((c) => c.id === conversationId);


    if (!convo) return;


    const liveBubble = allBubbles.find(
      (b) => b.conversation && b.conversation.id === conversationId
    );


    const openTarget: MovingBubble = liveBubble?.conversation
      ? {
          ...liveBubble.conversation,
          size: liveBubble.size,
          x: liveBubble.x,
          y: liveBubble.y,
          vx: liveBubble.vx,
          vy: liveBubble.vy,
        }
      : {
          ...convo,
          size: 72,
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
        };
        
    requestCloseProfileModal();
    await stopCurrentAudio();
    await handleBubblePress(openTarget);
  };

  function requestOpenProfileModal() {
    setOpenProfileSignal((prev) => prev + 1);
  }

  function requestCloseProfileModal() {
    setCloseProfileSignal((prev) => prev +1);
  }

  function requestOpenRecentlyLeftModal() {
    setOpenRecentlyLeftSignal((prev) => prev + 1);
  }

  function requestRefreshProfileInbox() {
  setRefreshProfileInboxSignal((prev) => prev + 1);
}

const refreshProfileInbox = useCallback(() => {
  requestRefreshProfileInbox();
},[]);


const submitConversationRequest = useConversationRequestFlow({
  t,
  openConversation: openConversationById,
  openProfile: requestOpenProfileModal,
  refreshAll: refreshProfileInbox,
});

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
              submitConversationRequest(identifier).catch((err) => {
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

  async function handleDeleteConversation(bubble: MovingBubble) {
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

  function handleBubbleLongPress(bubble: MovingBubble) {
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


  async function handleBubblePress(bubble: MovingBubble) {
    setActiveConversation(bubble);
    setChatMessages([]);
    setDraft("");


    try {
      const raw = await apiJson<any[]>(`/api/conversations/${bubble.id}/messages`);

      const msgs: ChatMessage[] = Array.isArray(raw)
        ? raw.map((m: any) => mapApiMessageToChatMessage(m, myUserId))
        : [];

    const unique = uniqByIdKeepOrder(msgs);
    const sorted = sortChatMessagesByCreatedAt(unique);
    setChatMessages(sorted);

    const newestUnread = [...sorted]
      .filter((m) => !m.isMine && !!m.audioUrl && !m.listenedAt)
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

      const rejoinRequestSent = !!saved?.rejoinRequestSent;
      const rejoinTargetUsername = 
        typeof saved?.rejoinTargetUsername === "string"
          ? saved.rejoinTargetUsername
          : null;


      const savedId = String(saved.id);
      const finalMsg: ChatMessage = mapApiMessageToChatMessage(saved, myUserId);


      // Replace optimistic temp message
      setChatMessages((prev) => {
        const next = prev.map((m) => (m.id === tempId ? finalMsg : m));
        return sortChatMessagesByCreatedAt(next);
      });


      // ✅ Broadcast to room so other device gets it instantly
      const ws = wsRef.current;
      if (ws && isWsOpen(ws)) {
        

      sendJson(ws, {
        type: "msg:new",
        convoId,
        messageId: savedId,
        senderId: String(saved.senderId ?? myUserId ?? "me"),
        createdAt: finalMsg.createdAt,
      } satisfies WsMsgNew);
      }

      if (rejoinRequestSent) {
        requestRefreshProfileInbox();

      Alert.alert(
        t("common.rejoinRequestSentTitle"),
        rejoinTargetUsername
          ? t("common.rejoinMessageSentBody", { username: rejoinTargetUsername })
          : t("common.rejoinRequestSentBody"),
        [
          {
            text: t("common.okay"),
            onPress: async () => {
              await stopCurrentAudio().catch(() => {});
              setActiveConversation(null);
              setChatMessages([]);
              setDraft("");
              disconnectWs?.();
              requestOpenProfileModal();
            },
          },
        ]
      );
    }


    } catch (err: any) {
      console.warn("Failed to send message:", err);

       // Remove optimistic message on failure
  setChatMessages((prev) => prev.filter((m) => m.id !== tempId));

  // ✅ If backend says rejoin is pending, open Profile and show Pending/Requests
  if (isApiError(err)) {
    const payload = err.payload;


if (payload?.code === "REJOIN_PENDING") {
  await stopCurrentAudio().catch(() => {});
  setActiveConversation(null);
  setChatMessages([]);
  setDraft("");

  disconnectWs?.();

  requestRefreshProfileInbox();

  Alert.alert(
    t("common.rejoinPendingTitle"),
    payload?.action === "OPEN_PENDING" 
      ? t("common.rejoinPendingOpenPending")
      : t("common.rejoinPendingOpenRequests"),
    [
      { 
        text: t("common.okay"),
        onPress: () => requestOpenProfileModal(),
      },
    ]
  );

  return;
}

  }

      Alert.alert(t("common.sendFailed"), err?.message ?? t("common.couldNotSend"));
    }
  }

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


<View 
  style={[styles.leftRail, { top: screenHeight * 0.23 }]}
    pointerEvents={activeConversation ? "none" : "auto"}
>
  <TouchableOpacity
    activeOpacity={0.85}
    style={styles.railBtn}
    onPress={() => {
      requestOpenRecentlyLeftModal();
    }}
  >
    <Text style={styles.railBtnText}>⏱️</Text>
  </TouchableOpacity>

  <TouchableOpacity
    activeOpacity={0.85}
    style={styles.railBtn}
    onPress={() => setStarredOpen(true)}
  >
    <Text style={styles.railBtnText}>🫧</Text>
  </TouchableOpacity>

  <TouchableOpacity
    activeOpacity={0.85}
    style={styles.railBtn}
    onPress={() => setExtrasOpen(true)}
  >
    <Text style={styles.railBtnText}>💥</Text>
  </TouchableOpacity>
</View>

<FakeBubbleModal
  visible={starredOpen}
  onClose={() => setStarredOpen(false)}
  t={t}
  fakeBubbles={fakeBubbles}
  onAddFakeBubble={() => {
    addFakeBubble().catch((err: any) => {
      Alert.alert(
        t("common.errorTitle"), 
        err?.message ?? t("errors.requestFailed")
      );
    });
  }}
/>

<ExtrasModal
  visible={extrasOpen}
  onClose={() => setExtrasOpen(false)}
  t={t}
/>

<FloatingConversationField
  bubbles={allBubbles}
  disabled={!!activeConversation}
  nowMs={nowMs}
  isUserOnline={isUserOnline}
  onPressBubble={(bubble) => {
    handleBubblePress(bubble).catch(() => {});
  }}
  onLongPressBubble={(bubble) => {
    handleBubbleLongPress(bubble);
  }}
  onLongPressFakeBubble={(id) => {
    removeFakeBubble(id).catch((err: any) => {
      Alert.alert(
        t("common.errorTitle"),
        err?.message ?? t("errors.requestFailed")
      );
    });
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

      <ProfileEntryPoint
        t={t}
        router={router}
        refreshConversations={refreshConversations}
        disabled={!!activeConversation}
        openProfileSignal={openProfileSignal}
        closeProfileSignal={closeProfileSignal}
        openRecentlyLeftSignal={openRecentlyLeftSignal}
        refreshProfileInboxSignal={refreshProfileInboxSignal}
        onAcceptedConversation={(conversationId) => openConversationById(conversationId)}
        onOpenContacts={() => {
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
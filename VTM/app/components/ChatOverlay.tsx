import React from "react";
import {
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Dimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { Conversation } from "../../lib/types";


const { width, height } = Dimensions.get("window");


const GLASS_COLORS = [
  "rgba(255, 255, 255, 0.58)",
  "rgba(255, 255, 255, 0.2)",
  "rgba(180, 220, 255, 0.35)",
  "rgba(255, 180, 220, 0.25)",
] as const;


const HIGHLIGHT_COLORS = ["rgba(255,255,255,0.35)", "rgba(255,255,255,0)"] as const;


export type ReceiptStatus = "posted" | "read" | "listened";


export type ChatOverlayMessage = {
  id: string;
  senderId: string;
  text: string;
  createdAt?: string;
  audioUrl?: string | null;
  audioDurationMs?: number | null;
  readAt?: string | null;
  listenedAt?: string | null;
  isMine: boolean;
  receipt?: ReceiptStatus;
};


type Props = {
  visible: boolean;
  activeConversation: Conversation | null;
  chatMessages: ChatOverlayMessage[];
  draft: string;
  keyboardHeight: number;
  inputOffset: number;
  otherTyping: boolean;
  otherOnline: boolean;
  playingMessageId: string | null;
  t: (key: string, options?: any) => string;
  onBack: () => void;
  onChangeDraft: (value: string) => void;
  onSend: () => void;
  onPlayMessage: (message: ChatOverlayMessage) => void;
};


export default function ChatOverlay({
  visible,
  activeConversation,
  chatMessages,
  draft,
  keyboardHeight,
  inputOffset,
  otherTyping,
  otherOnline,
  playingMessageId,
  t,
  onBack,
  onChangeDraft,
  onSend,
  onPlayMessage,
}: Props) {
  if (!visible || !activeConversation) return null;


  const bottomPad = Math.max(10, keyboardHeight + inputOffset);


  return (
    <View style={styles.chatOverlay}>
      <LinearGradient
        colors={GLASS_COLORS}
        style={[styles.chatBubble, { paddingBottom: bottomPad }]}
      >
        <LinearGradient
          colors={HIGHLIGHT_COLORS}
          style={[StyleSheet.absoluteFill, { borderRadius: 32 }]}
        />


        <View style={styles.chatHeader}>
          <TouchableOpacity onPress={onBack} style={styles.chatBackButton} activeOpacity={0.7}>
            <Text style={styles.chatBackText}>{t("common.back")}</Text>
          </TouchableOpacity>


          <View style={styles.chatHeaderCenter}>
            <Text style={styles.chatTitle} numberOfLines={1}>
              {activeConversation.title}
            </Text>
          </View>


          <View style={[styles.chatHeaderAvatarWrap, otherOnline && styles.chatHeaderAvatarOnline]}>
            {activeConversation.avatarUrl ? (
              <Image source={{ uri: activeConversation.avatarUrl }} style={styles.chatHeaderAvatar} />
            ) : (
              <View style={styles.chatHeaderAvatarFallback}>
                <Text style={styles.chatHeaderAvatarFallbackText}>
                  {(activeConversation.title?.[0] ?? "Y").toUpperCase()}
                </Text>
              </View>
            )}
          </View>
        </View>


        <View style={styles.chatMessagesArea}>
          <FlatList
            data={chatMessages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: 12 }}
            renderItem={({ item }) => {
              const isMe = item.isMine;
              const hasAudio = !!item.audioUrl;


              const receiptLabel =
                isMe && item.id && !item.id.startsWith("tmp:")
                  ? item.receipt === "listened"
                    ? t("common.receiptListened")
                    : t("common.receiptPosted")
                  : null;


              return (
                <View style={{ marginBottom: 8 }}>
                  <View
                    style={[
                      styles.chatMessageRow,
                      {
                        justifyContent: isMe ? "flex-end" : "flex-start",
                        alignItems: "center",
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.chatMessageBubble,
                        { backgroundColor: isMe ? "#111111" : "#000000ff" },
                      ]}
                    >
                      <Text style={{ color: isMe ? "white" : "#ffffffff" }}>{item.text}</Text>
                    </View>


                    <TouchableOpacity
                      activeOpacity={hasAudio ? 0.8 : 1}
                      onPress={() => {
                        if (!hasAudio) return;
                        onPlayMessage(item);
                      }}
                      style={[
                        styles.playButton,
                        { marginLeft: 6, opacity: hasAudio ? 1 : 0.3 },
                      ]}
                    >
                      <Text style={styles.playButtonText}>
                        {hasAudio && playingMessageId === item.id ? "⏸️" : "▶️"}
                      </Text>
                    </TouchableOpacity>
                  </View>


                  {receiptLabel && (
                    <View style={{ alignItems: "flex-end", paddingRight: 6, marginTop: 2 }}>
                      <Text style={styles.receiptText}>{receiptLabel}</Text>
                    </View>
                  )}
                </View>
              );
            }}
          />
        </View>


        {otherTyping && (
          <View style={{ marginBottom: 6, paddingLeft: 2 }}>
            <Text style={styles.typingText}>{t("common.receiptIndicator")}</Text>
          </View>
        )}


        <View style={styles.chatInputRow}>
          <TextInput
            value={draft}
            onChangeText={onChangeDraft}
            placeholder={t("common.typeMessage")}
            placeholderTextColor="#000000ff"
            style={styles.chatInput}
            multiline={false}
          />
          <TouchableOpacity onPress={onSend} style={styles.chatSendButton} activeOpacity={0.85}>
            <Text style={styles.chatSendText}>{t("common.send")}</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </View>
  );
}


const styles = StyleSheet.create({
  chatOverlay: {
    position: "absolute",
    top: height * 0.07,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "flex-start",
    zIndex: 50,
    elevation: 50,
  },


  chatBubble: {
    width: width * 0.9,
    height: height * 0.8,
    borderRadius: 32,
    paddingHorizontal: 20,
    paddingTop: 20,
    shadowColor: "#ffffffff",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
    overflow: "hidden",
  },


  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },


  chatBackButton: {
    paddingRight: 8,
    paddingVertical: 4,
  },


  chatBackText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#111827",
  },


  chatHeaderCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },


  chatTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },


  chatHeaderAvatarWrap: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0,
  },


  chatHeaderAvatarOnline: {
    borderWidth: 2,
    borderColor: "#00d13b",
  },


  chatHeaderAvatar: {
    width: "100%",
    height: "100%",
    borderRadius: 999,
    resizeMode: "cover",
  },


  chatHeaderAvatarFallback: {
    width: "100%",
    height: "100%",
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
  },


  chatHeaderAvatarFallbackText: {
    color: "white",
    fontWeight: "900",
  },


  chatMessagesArea: {
    flex: 1,
  },


  chatMessageRow: {
    flexDirection: "row",
  },


  chatMessageBubble: {
    maxWidth: "75%",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
  },


  playButton: {
    marginLeft: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.7)",
    minWidth: 42,
    alignItems: "center",
    justifyContent: "center",
  },


  playButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },


  typingText: {
    fontSize: 13,
    fontWeight: "800",
    color: "rgba(17,24,39,0.75)",
  },


  receiptText: {
    fontSize: 11,
    fontWeight: "800",
    color: "rgba(255,255,255,0.85)",
  },


  chatInputRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 10,
  },


  chatInput: {
    flex: 1,
    fontSize: 15,
    color: "#000000ff",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#000000ff",
    marginRight: 10,
  },


  chatSendButton: {
    backgroundColor: "#000000ff",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    minWidth: 88,
    alignItems: "center",
    justifyContent: "center",
  },


  chatSendText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
});

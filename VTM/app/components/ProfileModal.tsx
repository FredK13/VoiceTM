import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Image,
  FlatList,
  RefreshControl,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type {
  IncomingInvite,
  OutgoingInvite,
  IncomingContactInvite,
  OutgoingContactInvite,
  IncomingRejoinInvite,
  OutgoingRejoinInvite,
} from "../../lib/types";


const GLASS_COLORS = [
  "rgba(255, 255, 255, 0.58)",
  "rgba(255, 255, 255, 0.2)",
  "rgba(180, 220, 255, 0.35)",
  "rgba(255, 180, 220, 0.25)",
] as const;


const HIGHLIGHT_COLORS = ["rgba(255,255,255,0.35)", "rgba(255,255,255,0)"] as const;


function initialFromUsername(username?: string | null, fallback?: string) {
  const ch = (username?.trim()?.[0] ?? fallback?.trim()?.[0] ?? "Y").toUpperCase();
  return ch;
}


type IncomingChatAny = IncomingInvite | IncomingRejoinInvite;
type OutgoingChatAny = OutgoingInvite | OutgoingRejoinInvite;


type IncomingNotif =
  | { kind: "chat"; id: string; createdAt: string; user: { username: string }; raw: IncomingChatAny }
  | { kind: "contact"; id: string; createdAt: string; user: { username: string }; raw: IncomingContactInvite };


type OutgoingNotif =
  | { kind: "chat"; id: string; createdAt: string; user: { username: string }; raw: OutgoingChatAny }
  | { kind: "contact"; id: string; createdAt: string; user: { username: string }; raw: OutgoingContactInvite };


type Props = {
  visible: boolean;
  onClose: () => void;


  t: (key: string, options?: any) => string;


  myUsername: string;
  myAvatarUrl: string | null;


  unifiedIncoming: IncomingNotif[];
  unifiedOutgoing: OutgoingNotif[];


  loadingRequests: boolean;
  loadingPending: boolean;


  onRefreshRequests: () => void;
  onRefreshPending: () => void;


  onAcceptChatRequest: (item: IncomingChatAny) => void;
  onRejectChatRequest: (item: IncomingChatAny) => void;
  onAcceptContactRequest: (item: IncomingContactInvite) => void;
  onRejectContactRequest: (item: IncomingContactInvite) => void;

  onCancelPending: (item: OutgoingNotif) => void;

  onPickAndUploadAvatar: () => void;
  onRemoveAvatar: () => void;


  onOpenContacts: () => void;
};


export default function ProfileModal({
  visible,
  onClose,
  t,
  myUsername,
  myAvatarUrl,
  unifiedIncoming,
  unifiedOutgoing,
  loadingRequests,
  loadingPending,
  onRefreshRequests,
  onRefreshPending,
  onAcceptChatRequest,
  onRejectChatRequest,
  onAcceptContactRequest,
  onRejectContactRequest,
  onCancelPending,
  onPickAndUploadAvatar,
  onRemoveAvatar,
  onOpenContacts,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />


        <View style={styles.profilePanel}>
          <View style={styles.profileHeader}>
            <Text style={{ fontSize: 18, fontWeight: "800" }}>{t("common.profile")}</Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.8}>
              <Text style={{ fontSize: 16, fontWeight: "800" }}>X</Text>
            </TouchableOpacity>
          </View>


          <View style={styles.profileRow}>
            <View style={styles.profileBigOuterBubble}>
              <LinearGradient colors={GLASS_COLORS} style={StyleSheet.absoluteFill} />
              <LinearGradient colors={HIGHLIGHT_COLORS} style={StyleSheet.absoluteFill} />


              <View style={styles.profileBigInnerCircle}>
                {myAvatarUrl ? (
                  <Image source={{ uri: myAvatarUrl }} style={styles.profileBigAvatarImage} />
                ) : (
                  <Text
                    style={styles.profileBigInnerText}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.35}
                  >
                    {initialFromUsername(myUsername, "Y")}
                  </Text>
                )}
              </View>
            </View>


            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: "800" }}>{myUsername || "@"}</Text>


              <View style={styles.profileActionsRow}>
                <TouchableOpacity
                  onPress={onPickAndUploadAvatar}
                  activeOpacity={0.85}
                  style={styles.editAvatarBtnSmall}
                >
                  <Text style={styles.editAvatarBtnSmallText}>{t("common.editImage")}</Text>
                </TouchableOpacity>


                <TouchableOpacity
                  onPress={onRemoveAvatar}
                  activeOpacity={0.85}
                  style={[styles.trashBtn, { opacity: myAvatarUrl ? 1 : 0.35 }]}
                  disabled={!myAvatarUrl}
                >
                  <Text style={styles.trashText}>🗑️</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={styles.profileContentSpacer} />

          <View style={styles.sectionHeader}>
            <Text style={{ fontSize: 16, fontWeight: "900" }}>
              {t("common.requests")} {unifiedIncoming.length ? `(${unifiedIncoming.length})` : ""}
            </Text>
          </View>


          <View style={styles.requestsBox}>
            <FlatList
              data={unifiedIncoming}
              keyExtractor={(r) => `${r.kind}:${r.id}`}
              showsVerticalScrollIndicator={false}
              style={styles.requestsList}
              contentContainerStyle={styles.requestsContent}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              refreshControl={
                <RefreshControl
                  refreshing={loadingRequests}
                  onRefresh={onRefreshRequests}
                  tintColor="#111"
                  colors={["#111"]}
                />
              }
              ListEmptyComponent={
                !loadingRequests ? <Text style={{ paddingVertical: 10 }}>{t("common.noRequests")}</Text> : null
              }
              renderItem={({ item }) => (
                <View style={styles.requestRow2}>
                  <Text style={{ fontWeight: "900" }}>{item.user.username}</Text>


                  <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                    <TouchableOpacity
                      onPress={() => {
                        if (item.kind === "chat") onAcceptChatRequest(item.raw);
                        else onAcceptContactRequest(item.raw);
                      }}
                      style={[styles.reqBtn, { backgroundColor: "#00a82f" }]}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.reqBtnText}>
                        {item.kind === "chat" ? t("common.accept") : t("common.add")}
                      </Text>
                    </TouchableOpacity>


                    <TouchableOpacity
                      onPress={() => {
                        if (item.kind === "chat") onRejectChatRequest(item.raw);
                        else onRejectContactRequest(item.raw);
                      }}
                      style={[styles.reqBtn, { backgroundColor: "#111" }]}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.reqBtnText}>
                        {item.kind === "chat" ? t("common.ignore") : t("common.deny")}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            />
          </View>


          <View style={[styles.sectionHeader, { marginTop: 10 }]}>
            <Text style={{ fontSize: 16, fontWeight: "900" }}>
              {t("common.pending")} {unifiedOutgoing.length ? `(${unifiedOutgoing.length})` : ""}
            </Text>
          </View>


          <View style={styles.pendingBox}>
            <FlatList
              data={unifiedOutgoing}
              keyExtractor={(r) => `${r.kind}:${r.id}`}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 8, flexGrow: 1 }}
              refreshControl={
                <RefreshControl
                  refreshing={loadingPending}
                  onRefresh={onRefreshPending}
                  tintColor="#111"
                  colors={["#111"]}
                />
              }
              ListEmptyComponent={
                !loadingPending ? <Text style={{ paddingVertical: 10 }}>{t("common.noPending")}</Text> : null
              }
              renderItem={({ item }) => (
                <View style={styles.pendingRow}>
                  <Text style={styles.pendingName}>
                    {item.user.username} {item.kind === "contact" ? "•" : ""}
                  </Text>

                    <TouchableOpacity
                      onPress={() => onCancelPending(item)}
                      style={styles.cancelPendingBtn}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.cancelPendingBtnText}>{t("common.cancel")}</Text>
                    </TouchableOpacity>
                  </View>
                )}
            />
          </View>


          <View style={[styles.sectionHeader, { marginTop: 14, justifyContent: "flex-end" }]}>
            <TouchableOpacity onPress={onOpenContacts} activeOpacity={0.85} style={styles.smallPillOutline}>
              <Text style={styles.smallPillOutlineText}>{t("common.contacts")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}


const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.27)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 18,
  },


  profilePanel: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "100%",
    height: "73%",
    backgroundColor: "rgba(255, 255, 255, 0.6)",
    borderRadius: 22,
    padding: 16,
  },


  profileHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },


  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },


  profileBigOuterBubble: {
    width: 63,
    height: 63,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },


  profileBigInnerCircle: {
    width: 57,
    height: 57,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.65)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },


  profileBigAvatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 999,
  },


  profileBigInnerText: {
    color: "#ff0015ff",
    fontWeight: "900",
    fontSize: 28,
    paddingHorizontal: 6,
    includeFontPadding: false,
  },


  profileActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
  },


  editAvatarBtnSmall: {
    backgroundColor: "#00a82f",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
  },


  editAvatarBtnSmallText: {
    color: "white",
    fontWeight: "900",
  },


  trashBtn: {
    backgroundColor: "#111",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
  },


  trashText: {
    color: "white",
    fontWeight: "900",
  },


  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },

  profileContentSpacer: {
    height: 73,
  },

  requestsBox: {
    minHeight: 140,
    maxHeight: 140,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.04)",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },


  requestsList: {
    flexGrow: 0,
  },


  requestsContent: {
    paddingBottom: 6,
    flexGrow: 1,
  },


  requestRow2: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.12)",
  },


  reqBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
  },


  reqBtnText: {
    color: "white",
    fontWeight: "900",
  },


  pendingBox: {
    minHeight: 140,
    maxHeight: 140,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.04)",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },

  
  pendingRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.12)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },


  pendingName: {
    fontWeight: "900",
    flex: 1,
  },


  cancelPendingBtn: {
    backgroundColor: "#111",
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
  },


  cancelPendingBtnText: {
    color: "white",
    fontWeight: "900",
    fontSize: 12,
  },


  smallPillOutline: {
    borderWidth: 1.5,
    borderColor: "#111",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },


  smallPillOutlineText: {
    color: "#111",
    fontWeight: "900",
  },
});



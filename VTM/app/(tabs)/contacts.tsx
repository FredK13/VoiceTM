// (tabs)/contacts.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";

import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  TextInput,
  FlatList,
  Image,
  Alert,
  Dimensions,
  RefreshControl,
} from "react-native";

import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { apiFetch, apiJson } from "../../lib/api";
import { useTranslation } from "react-i18next";

import type {
  ContactsResponse, ContactRow, ContactRequestResponse, PresenceBatchResponse,
} from "../../lib/types";

import { usePresence } from "../../lib/presence";
import ContactsBlockedList from "../components/contactsComponents/ContactsBlockedList";
import ContactsSettings from "../components/contactsComponents/ContactsSettings";


const { width } = Dimensions.get("window");
const BUBBLE = Math.min(92, Math.max(66, width * 0.185));
const RING = 4;


const GLASS_COLORS = ["rgba(255, 255, 255, 0.7)", "rgba(180,220,255,0.5)"] as const;
const HIGHLIGHT_COLORS = ["rgba(255,255,255,0.9)", "rgba(180,220,255,0.5)"] as const;


function initialFromUsername(username?: string | null, fallback = "Y") {
  return (username?.trim()?.[0] ?? fallback).toUpperCase();
}


export default function ContactsScreen() {
  const router = useRouter();
  const { t } = useTranslation();


  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(false);


  const [addOpen, setAddOpen] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [sending, setSending] = useState(false);


  const [nowMs, setNowMs] = useState(() => Date.now());
  const { setFromSnapshot, isUserOnline } = usePresence();

  const [selectedContact, setSelectedContact] = useState<ContactRow["user"] | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [sendingYap, setSendingYap] = useState(false);

  const selectedContactOnline =
  !!selectedContact?.id && isUserOnline(selectedContact.id, nowMs);

  const clockTimerRef = useRef<any>(null);


  async function refreshContacts() {
    setLoading(true);
    try {
      const out = await apiJson<ContactsResponse>("/api/contacts");
      const rows = Array.isArray(out.contacts) ? out.contacts : [];
      setContacts(rows);


      const ids = rows.map((r) => r.user.id).filter(Boolean);


      if (ids.length) {
        try {
          const p = await apiJson<PresenceBatchResponse>("/api/contacts/presence", {
            method: "POST",
            json: { userIds: ids },
          });


          const map: Record<string, string | null> = {};
          for (const u of p.users ?? []) {
            map[u.id] = u.lastSeenAt ?? null;
          }


          setFromSnapshot(map);
        } catch (e) {
          console.warn("presence snapshot failed:", e);
        }
      }
    } catch (e: any) {
      console.warn("refreshContacts failed:", e);
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }

  function openContactProfile(user: ContactRow["user"]) {
  setSelectedContact(user);
  setProfileOpen(true);
}

function closeContactProfile() {
  setProfileOpen(false);
  setSelectedContact(null);
}


  useEffect(() => {
    refreshContacts().catch(() => {});


    clockTimerRef.current = setInterval(() => setNowMs(Date.now()), 1_000);


    return () => {
      if (clockTimerRef.current) clearInterval(clockTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  async function sendContactInvite() {
    const value = identifier.trim();
    if (!value) return;


    setSending(true);
    try {
      const res = await apiJson<ContactRequestResponse>("/api/contacts/request", {
        method: "POST",
        json: { identifier: value },
      });


      if (res.status === "ALREADY_ADDED") {
        Alert.alert(t("common.alreadyConnectedTitle"), t("common.alreadyConnectedBody"));
        return;
      }
      if (res.status === "PENDING_ALREADY") {
        Alert.alert(t("common.pending"), t("common.currentRequestPending"));
        return;
      }
      if (res.status === "INCOMING_PENDING") {
        Alert.alert(t("common.requestWaitingTitle"), t("common.requestWaitingBody"));
        return;
      }


      Alert.alert(t("common.sent"), t("common.requestSent"));
      setAddOpen(false);
      setIdentifier("");
      await refreshContacts();
    } catch (e: any) {
      Alert.alert(t("common.errorTitle"), e?.message ?? t("common.serverError"));
    } finally {
      setSending(false);
    }
  }


  async function removeContact(contactUserId: string) {
    try {
      await apiFetch(`/api/contacts/${contactUserId}`, { method: "DELETE" });
      await refreshContacts();
    } catch (e: any) {
      Alert.alert(t("common.errorTitle"), e?.message ?? t("common.serverError"));
    }
  }


  async function blockUser(contactUserId: string) {
    try {
      await apiFetch(`/api/contacts/block/${contactUserId}`, { method: "POST" });
      await refreshContacts();
    } catch (e: any) {
      Alert.alert(t("common.errorTitle"), e?.message ?? t("common.serverError"));
    }
  }

  async function sendYapToSelectedContact() {
  const user = selectedContact;
  if (!user || sendingYap) return;

  const openMessagesProfile = () => {
    router.push ({
      pathname: "/messages",
      params: { openProfile: String(Date.now())},
    });
  };

  setSendingYap(true);
  try {
    const res = await apiJson<any>("/api/conversations/request", {
      method: "POST",
      json: { identifier: user.username },
    });


    if (res.status === "ALREADY_CONNECTED" && res.conversationId) {
  const conversationId = String(res.conversationId);

  closeContactProfile();

  router.push({
    pathname: "/messages",
    params: { openConversationId: conversationId },
  });

  return;
}


    if (res.status === "PENDING_ALREADY") {
      Alert.alert(t("common.pending"), t("common.currentRequestPending"));
      return;
    }


    if (res.status === "INCOMING_PENDING") {
      closeContactProfile();

      Alert.alert(
        t("common.requestWaitingTitle"), 
        t("common.requestWaitingBody"),
        [
          {
            text: t("common.open"),
            onPress: openMessagesProfile,
          },
          { text: t("common.cancel"), style: "cancel" },
        ]
      );
      return;
    }


    if (res.status === "REJOIN_SENT") {
      closeContactProfile();

      Alert.alert(
        t("common.rejoinRequestSentTitle"), 
        t("common.rejoinRequestSentBody"),
        [
          {
            text: t("common.open"),
            onPress: openMessagesProfile,
          },
          { text: t("common.cancel"), style: "cancel" },
        ]
      );
      return;
    }

      closeContactProfile();

      Alert.alert(
        t("common.sent"), 
        t("common.requestSent"),
        [
          {
            text: t("common.okay"),
            onPress: openMessagesProfile,
          },
        ]
      );
    } catch (e: any) {
      Alert.alert(t("common.errorTitle"), e?.message ?? t("common.serverError"));
    } finally {
      setSendingYap(false);
    }
  }


  function onLongPressContact(u: ContactRow["user"]) {
    Alert.alert(
      u.username,
      "",
      [
        {
          text: t("common.remove"),
          style: "destructive",
          onPress: () => removeContact(u.id).catch(() => {}),
        },
        {
          text: t("common.block"),
          style: "destructive",
          onPress: () => blockUser(u.id).catch(() => {}),
        },
        { text: t("common.cancel"), style: "cancel" },
      ],
      { cancelable: true }
    );
  }


  const data = useMemo(() => contacts, [contacts]);


  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t("common.contacts")}</Text>


        <View style={styles.headerButtonsRow}>
          <GlassPill onPress={() => setAddOpen(true)} label="+" />
          <GlassPill onPress={() => router.push("/messages")} label={t("common.back")} />
        </View>
      </View>


      <View style={styles.card}>
        <LinearGradient
          colors={["rgba(255,255,255,0.22)", "rgba(255,255,255,0.08)"] as const}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />


        <View style={styles.cardHeaderRow}>
          <Text style={styles.bigText}>{t("common.yourContacts")}</Text>
        </View>


        <FlatList
          data={data}
          keyExtractor={(c) => c.id}
          numColumns={3}
          columnWrapperStyle={{ gap: 14 }}
          contentContainerStyle={{ paddingTop: 12, paddingBottom: 10, gap: 14 }}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={() => refreshContacts().catch(() => {})}
              tintColor="#ffffff"
              colors={["#ffffff"]}
            />
          }
          renderItem={({ item }) => {
            const u = item.user;
            const innerSize = Math.max(10, BUBBLE - RING * 2);
            const online = isUserOnline(u.id, nowMs);


            return (
              <View style={styles.contactItem}>
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => openContactProfile(u)}
                  onLongPress={() => onLongPressContact(u)}
                  delayLongPress={600}
                >
                  <View
                    style={[
                      styles.contactBubbleOuter,
                      online ? styles.contactBubbleOuterOnline : null,
                    ]}
                  >
                    {!online && (
                      <>
                        <LinearGradient colors={GLASS_COLORS} 
                          style={StyleSheet.absoluteFill} />
                        <LinearGradient colors={HIGHLIGHT_COLORS} 
                          style={StyleSheet.absoluteFill} />
                      </>
                    )}

                  <View
                    style={[
                        styles.contactBubbleInner,
                      {
                        width: innerSize,
                        height: innerSize,
                        borderRadius: innerSize / 2,
                      },
                    ]}
                  > 

                      {u.avatarUrl ? (
                        <Image
                          source={{ uri: u.avatarUrl }}
                          style={styles.contactAvatarImage}
                        />
                      ) : (
                        <Text style={styles.fallbackLetter}>{initialFromUsername(u.username, "Y")}</Text>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>


              </View>
            );
          }}
          ListEmptyComponent={!loading ? <Text style={styles.emptyText}>{t("common.noContactsYet")}</Text> : null}
        />
      </View>

      <View style={styles.bottomButtonsRow}>
        <ContactsBlockedList
          onPress={() => {
            Alert.alert("Blocked list", "Coming soon");
          }}
        />
        <ContactsSettings
          onPress={() => {
            Alert.alert("Contacts settings", "Coming soon");
          }}
        />

    </View>
      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setAddOpen(false)} />


          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t("common.addContact")}</Text>
            <Text style={styles.modalSubtitle}>{t("common.enterUsernameOrEmail")}</Text>


            <TextInput
              value={identifier}
              onChangeText={setIdentifier}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={t("common.usernameOrEmailPlaceholder")}
              placeholderTextColor="rgba(255, 255, 255, 0.52)"
              style={styles.input}
            />


            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setAddOpen(false)}
                style={[
                  styles.smallBtn,
                  styles.cancelBtn,
                  { opacity: sending ? 0.6 : 1 },
                ]}
              >
                <Text style={styles.smallBtnText}>{t("common.cancel")}</Text>
              </TouchableOpacity>


              <TouchableOpacity
                activeOpacity={0.85}
                onPress={sendContactInvite}
                disabled={sending}
                style={[
                  styles.smallBtn,
                  styles.sendBtn,
                  { opacity: sending ? 0.6 : 1 },
                ]}
              >
                <Text style={styles.smallBtnText}>
                  {sending ? t("common.sending") : t("common.sendRequest")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={profileOpen} transparent animationType="fade" onRequestClose={closeContactProfile}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeContactProfile} />

          <View style={styles.contactProfileCard}>
            <TouchableOpacity
              onPress={closeContactProfile}
              activeOpacity={0.8}
              style={styles.contactProfileCloseBtn}
          >
              <Text style={styles.contactProfileCloseText}>X</Text>
            </TouchableOpacity>

          <View style={styles.contactProfileTopRow}>
            <View style={styles.contactProfileRightColumn}>
              <View
                style={[
                  styles.contactProfileBubbleOuter,
                  selectedContactOnline ? styles.contactProfileBubbleOuterOnline : null,
                ]}
              >
                {!selectedContactOnline && (
                  <>
                    <LinearGradient colors={GLASS_COLORS} style={StyleSheet.absoluteFill} />
                    <LinearGradient colors={HIGHLIGHT_COLORS} style={StyleSheet.absoluteFill} />
                  </>
                )}


                <View style={styles.contactProfileBubbleInner}>
                  {selectedContact?.avatarUrl ? (
                    <Image
                      source={{ uri: selectedContact.avatarUrl }}
                      style={styles.contactProfileAvatarImage}
                    />
                  ) : (
                    <Text style={styles.contactProfileFallbackLetter}>
                      {initialFromUsername(selectedContact?.username, "Y")}
                    </Text>
                  )}
                </View>
              </View>


              <Text style={styles.contactProfileUsername}>
                {selectedContact?.username ?? ""}
              </Text>
            </View>
          </View>

          <View style={styles.contactProfileBody}>
            <Text style={styles.contactProfilePlaceholder}>Yap score:</Text>
            <Text style={styles.contactProfilePlaceholder}>yapees:</Text>
            <Text style={styles.contactProfilePlaceholder}>yappers:</Text>
          </View>

          <View style={styles.contactProfileBottomRow}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={sendYapToSelectedContact}
              disabled={!selectedContact || sendingYap}
              style={[
                styles.contactProfileYapBtn,
                { opacity: !selectedContact || sendingYap ? 0.6 : 1 },
              ]}
            >
                <Text style={styles.contactProfileYapBtnText}>
                  {sendingYap ? t("common.sending") : "Yap!"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );

}


function GlassPill({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={styles.glassPill}>
      <LinearGradient colors={GLASS_COLORS} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={HIGHLIGHT_COLORS} style={StyleSheet.absoluteFill} />
      <Text style={styles.glassPillText}>{label}</Text>
    </TouchableOpacity>
  );
}


const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: "#ff0015ff", 
    paddingTop: 60, 
    paddingHorizontal: 18, 
  },

  header: { 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "space-between", 
    marginBottom: 14, 
  },

  title: { 
    fontSize: 26, 
    fontWeight: "900", 
    color: "#fffffffa", 
    letterSpacing: 0.3, 
  },

  glassPill: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 999,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },

  glassPillText: { 
    color: "#ff0015ff", 
    fontWeight: "900", 
    fontSize: 16, 
  },

  card: {
    borderRadius: 22,
    padding: 16,
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.5)",
    overflow: "hidden",
    height: "82%",
  },

  cardHeaderRow: { 
    flexDirection: "row", 
    justifyContent: "space-between", 
    alignItems: "center", 
  },

  bigText: { 
    fontSize: 18, 
    fontWeight: "900", 
    color: "#ffffff", 
  },

  fallbackLetter: {
    color: "white",
    fontWeight: "900",
    fontSize: 22,
    textAlign: "center",
    paddingHorizontal: 6,
    includeFontPadding: false,
  },

  emptyText: { 
    color: "rgba(255,255,255,0.9)", 
    fontWeight: "800", 
    paddingTop: 10,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(37, 17, 17, 0.6)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },

  modalCard: {
    width: "100%",
    borderRadius: 18,
    padding: 14,
    backgroundColor: "#ff0015ff",
    borderWidth: 1,
    borderColor: "rgb(255, 255, 255)",
  },

  modalTitle: { 
    fontSize: 18, 
    fontWeight: "900", 
    color: "#ffffff", 
  },

  modalSubtitle: { 
    marginTop: 6, 
    color: "#ffffff", 
    fontWeight: "700", 
  },

  input: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "rgb(255, 255, 255)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontWeight: "800",
    color: "#ffffff",
  },

  modalButtonsRow: { 
    flexDirection: "row", 
    gap: 10, 
    marginTop: 12, 
    justifyContent: "flex-end", 
  },

  smallBtn: { 
    paddingVertical: 10, 
    paddingHorizontal: 14, 
    borderRadius: 12,
},

  smallBtnText: { 
    color: "#ffffff", 
    fontWeight: "900", 
  },

  headerButtonsRow: { 
    flexDirection: "row", 
    gap: 10,
  },

  contactItem: { 
    width: BUBBLE, 
    alignItems: "center", 
  },

  contactBubbleOuter: { 
    width: BUBBLE,
    height: BUBBLE,
    borderRadius: BUBBLE / 2,
    overflow: "hidden", 
    alignItems: "center", 
    justifyContent: "center", 
  },

  contactBubbleInner: { 
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.6)",
  },

  contactAvatarImage: {
    width: "100%", 
    height: "100%", 
    borderRadius: 999
  },

  cancelBtn: {
    backgroundColor: "rgb(0, 0, 0)",
    borderColor: "rgb(255, 255, 255)",
    borderWidth: 1,
  },

  sendBtn: {
    backgroundColor: "#00d13b",
    borderColor: "rgb(255, 255, 255)",
    borderWidth: 1,
  },

  bottomButtonsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 100,
    marginTop: 20,
  },

  contactBubbleOuterOnline: {
    backgroundColor: "#00d13b",
  },

  contactProfileCard: {
  width: "100%",
  maxWidth: 420,
  minHeight: 360,
  borderRadius: 22,
  padding: 18,
  backgroundColor: "rgba(255, 0, 21, 0.95)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.9)",
},

contactProfileCloseBtn: {
  position: "absolute",
  top: 14,
  left: 14,
  zIndex: 2,
  paddingHorizontal: 10,
  paddingVertical: 6,
  borderRadius: 999,
  backgroundColor: "#ffffff",
},

contactProfileCloseText: {
  color: "#000000",
  fontWeight: "900",
  fontSize: 14,
},

contactProfileTopRow: {
  flexDirection: "row",
  justifyContent: "flex-end",
  marginTop: 0,
},

contactProfileRightColumn: {
  alignItems: "center",
  justifyContent: "flex-start",
  gap: 10,
},

contactProfileBubbleOuter: {
  width: 72,
  height: 72,
  borderRadius: 999,
  overflow: "hidden",
  alignItems: "center",
  justifyContent: "center",
},

contactProfileBubbleOuterOnline: {
  backgroundColor: "#00d13b",
},

contactProfileBubbleInner: {
  width: 63,
  height: 63,
  borderRadius: 999,
  backgroundColor: "rgba(255,255,255,0.7)",
  overflow: "hidden",
  alignItems: "center",
  justifyContent: "center",
},

contactProfileAvatarImage: {
  width: "100%",
  height: "100%",
  borderRadius: 999,
},

contactProfileFallbackLetter: {
  color: "#ff0015ff",
  fontWeight: "900",
  fontSize: 30,
  includeFontPadding: false,
},

contactProfileNameWrap: {
  alignItems: "center",
  paddingLeft: 0,
},

contactProfileUsername: {
  fontSize: 22,
  fontWeight: "900",
  color: "#ffffff",
  textAlign: "center",
},

contactProfileBody: {
  flex: 1,
  justifyContent: "center",
  paddingTop: 20,
  paddingBottom: 20,
},

contactProfilePlaceholder: {
  fontSize: 22,
  fontWeight: "900",
  color: "#ffffff",
  marginBottom: 8,
},

contactProfileBottomRow: {
  flexDirection: "row",
  justifyContent: "flex-end",
  alignItems: "flex-end",
  marginTop: 12,
},

contactProfileYapBtn: {
  backgroundColor: "#00d13b",
  borderRadius: 999,
  paddingHorizontal: 18,
  paddingVertical: 10,
  borderWidth: 1,
  borderColor: "white",
},

contactProfileYapBtnText: {
  color: "#fff",
  fontWeight: "900",
  fontSize: 16,
},
 
});
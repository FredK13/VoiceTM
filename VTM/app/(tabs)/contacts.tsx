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
  ContactsResponse,
  ContactRow,
  ContactRequestResponse,
  PresenceBatchResponse,
} from "../../lib/types";
import { usePresence } from "../../lib/presence";
import ContactsBlockedList from "../components/contactsComponents/ContactsBlockedList";
import ContactsSettings from "../components/contactsComponents/ContactsSettings";


const { width } = Dimensions.get("window");
const BUBBLE = Math.min(92, Math.max(66, width * 0.22));
const RING = 2;


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
                  onLongPress={() => onLongPressContact(u)}
                  delayLongPress={600}
                >
                  <View
                    style={styles.contactBubbleOuter}
                  >
                    <LinearGradient colors={GLASS_COLORS} style={StyleSheet.absoluteFill} />
                    <LinearGradient colors={HIGHLIGHT_COLORS} style={StyleSheet.absoluteFill} />


                    <View
                      style={[ 
                        styles.contactBubbleInner,                
                        { width: innerSize, height: innerSize, borderRadius: innerSize / 2, }
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


                <View style={styles.usernameRow}>
                  <View
                    style={[
                      styles.presenceDotLeft,
                      { backgroundColor: online ? "#00d13b" : "rgba(0,0,0,0.35)" },
                    ]}
                  />
                  <Text style={styles.usernameText} numberOfLines={1}>
                    {u.username}
                  </Text>
                </View>
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

  usernameRow: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: BUBBLE,
  },

  presenceDotLeft: {
    width: 9,
    height: 9,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.85)",
  },
  usernameText: { 
    color: "rgba(255,255,255,0.95)", 
    fontWeight: "900", 
    flexShrink: 1, 
  },

  emptyText: { 
    color: "rgba(255,255,255,0.9)", 
    fontWeight: "800", 
    paddingTop: 10,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(37, 17, 17, 0.25)",
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
    backgroundColor: "#00a82f",
    borderColor: "rgb(255, 255, 255)",
    borderWidth: 1,
  },

  bottomButtonsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 100,
    marginTop: 20,
  },
 
});
// app/(tabs)/settings.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
  Modal,
  Pressable,
  TextInput,
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { clearSession } from "../../lib/session";
import { useTranslation } from "react-i18next";
import LanguageDropdown from "../components/LanguageDropdown";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiJson } from "../../lib/api";



// 👇 default Yap emoji phrases (keep in sync with backend defaults)

const DEFAULT_EMOJI_MAP: Record<string, string> = {
  "😂": "hahaha",
  "🤣": "HAHAHAHA",
  "😊": "nothing wrong here",
  "😅": "hah",
  "😍": "you're beautiful",
  "🥹": "awwwe",
  "😭": "I'm bawling",
  "🔥": "Fire!",
  "💀": "I'm dead",
  "❤️": "love you",
  "💔": "I'm heart broken",
  "👍": "thumbs up",
  "👎": "thumbs down",
  "😎": "just chilling",
  "🤔": "I'm thinking",
  "🤯": "mind is blown!",
  "🥳": "party time",
  "🙏": "Thank god!",
  "🤨": "what?",
  "🙂‍↕️": "yes!",
  "🙂‍↔️": "no!",
  "😤": "I'm pissed now!",
  "🥶": "I'm cold",
  "😱": "OMG",
  "🤬": "beeep",
  "🫨": "earthquake!",
  "🤮": "bluuhh!",
  "💩": "poophead!",
  "😴": "sleepy time",
  "🙄": "annoying",
  "😬": "oops!",
  "🫩": "exhausted",
  "🤤": "get in my belly!",
  "😮‍💨": "feeeew",
  "😵‍💫": "I dont know where I am",
  "🤫": "shhhhh!",
  "🤝": "agreed",
  "👀": "looking",
  "🗣️": "LOUD NOISES!",
  "🖕": "BEEP BEEP!",
};

const EMOJI_STORAGE_KEY = "emoji_phrases_cache_v1";
const MAX_EMOJI_PHRASE_LEN = 35;


function coerceMapping(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}


type EmojiPhrasesResponse = {
  mapping: Record<string, string>;
};


export default function SettingsScreen() {
  const router = useRouter();
  const { t } = useTranslation();


  const [showEmojiPhrases, setShowEmojiPhrases] = useState(false);


  const [emojiMap, setEmojiMap] = useState<Record<string, string>>({ ...DEFAULT_EMOJI_MAP });


  // ✅ loading/saving UX
  const [loadingEmoji, setLoadingEmoji] = useState(true);
  const [savingEmoji, setSavingEmoji] = useState(false);


  const mergedDefault = useMemo(() => ({ ...DEFAULT_EMOJI_MAP }), []);


  // ✅ editor modal state
  const [editOpen, setEditOpen] = useState(false);
  const [editEmoji, setEditEmoji] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");


  function handleRecordPress() {
    router.push("/record/record");
  }


  // ✅ REAL LOGOUT
  function handleLogout() {
    Alert.alert(t("common.logoutTitle"), t("common.logoutBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.logout"),
        style: "destructive",
        onPress: async () => {
          await apiJson<{ ok: true }>("/api/presence/offline", {
            method: "POST",
          }).catch(() => {});

          await AsyncStorage.removeItem(EMOJI_STORAGE_KEY).catch(() => {});
          await clearSession().catch(() => {});
          router.replace("/login");
        },
      },
    ]);
  }


  async function loadEmojiPhrases() {
    setLoadingEmoji(true);


    // 1) load cache immediately
    try {
      const cached = await AsyncStorage.getItem(EMOJI_STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        const coerced = coerceMapping(parsed);
        if (coerced) setEmojiMap({ ...mergedDefault, ...coerced });
      }
    } catch {
      // ignore cache failures
    }


    // 2) fetch server (source of truth)
    try {
      const res = await apiJson<EmojiPhrasesResponse>("/api/me/emoji-phrases");
      const serverMap = coerceMapping(res?.mapping) ?? {};
      const merged = { ...mergedDefault, ...serverMap };


      setEmojiMap(merged);
      await AsyncStorage.setItem(EMOJI_STORAGE_KEY, JSON.stringify(serverMap)).catch(() => {});
    } catch (e) {
      console.warn("loadEmojiPhrases failed:", e);
    } finally {
      setLoadingEmoji(false);
    }
  }


  async function saveEmojiPhrases(nextFullMap: Record<string, string>) {
    setSavingEmoji(true);


    // store ONLY user overrides (diff from defaults) to keep payload tiny
    const overrides: Record<string, string> = {};
    for (const [emoji, phrase] of Object.entries(nextFullMap)) {
      if (phrase !== mergedDefault[emoji]) overrides[emoji] = phrase;
    }


    // 1) cache locally
    await AsyncStorage.setItem(EMOJI_STORAGE_KEY, JSON.stringify(overrides)).catch(() => {});


    // 2) push to server
    try {
      await apiJson<EmojiPhrasesResponse>("/api/me/emoji-phrases", {
        method: "PUT",
        json: { mapping: overrides },
      });
    } catch (e) {
      console.warn("saveEmojiPhrases failed:", e);
    } finally {
      setSavingEmoji(false);
    }
  }


  useEffect(() => {
    loadEmojiPhrases().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  function openEditor(emoji: string, currentPhrase: string) {
    setEditEmoji(emoji);
    setEditValue(currentPhrase ?? "");
    setEditOpen(true);
  }


  function closeEditor() {
    setEditOpen(false);
    setEditEmoji(null);
  }


  async function saveEditor() {
    const emoji = editEmoji;
    if (!emoji) return;


    // require non-empty
    if (!editValue || editValue.length === 0) return;


    const next = { ...emojiMap, [emoji]: editValue };
    setEmojiMap(next);
    await saveEmojiPhrases(next).catch(() => {});
    closeEditor();
  }


  function handleEditPhrase(emoji: string, currentPhrase: string) {
    openEditor(emoji, currentPhrase);
  }


  return (
    <View style={styles.root}>
      <View style={styles.overlay}>
        {/* ✅ Language dropdown (upper-left) */}
        <View style={styles.langWrapper}>
          <LanguageDropdown />
        </View>


        <View style={styles.content}>
          <TouchableOpacity
            style={styles.emojiButton}
            onPress={() => setShowEmojiPhrases((v) => !v)}
            activeOpacity={0.85}
          >
            <Text style={styles.emojiButtonText}>{t("settings.emojiPhrases")}</Text>
            <Text style={styles.emojiButtonSub}>
              {t(showEmojiPhrases ? "settings.tapToHide" : "settings.tapToView")}
            </Text>
          </TouchableOpacity>


          {showEmojiPhrases && (
            <View style={styles.emojiPanel}>
              <View style={styles.emojiPanelHeader}>
                <Text style={styles.emojiPanelTitle}>{t("settings.emojiPanelTitle")}</Text>


                {(loadingEmoji || savingEmoji) && (
                  <View style={styles.syncPill}>
                    <ActivityIndicator size="small" />
                    <Text style={styles.syncPillText}>
                      {loadingEmoji ? t("common.loading") : t("common.saving")}
                    </Text>
                  </View>
                )}
              </View>


              <ScrollView style={styles.emojiScroll} contentContainerStyle={styles.emojiScrollContent}>
                {Object.entries(emojiMap).map(([emoji, phrase]) => (
                  <TouchableOpacity
                    key={emoji}
                    style={styles.emojiRow}
                    activeOpacity={0.7}
                    onPress={() => handleEditPhrase(emoji, phrase)}
                    disabled={loadingEmoji}
                  >
                    <Text style={styles.emojiChar}>{emoji}</Text>
                    <Text style={styles.emojiPhrase}>{phrase}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}


          <TouchableOpacity style={styles.recordButton} onPress={handleRecordPress} activeOpacity={0.85}>
            <Text style={styles.recordText}>{t("settings.recordVoice")}</Text>
          </TouchableOpacity>


          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.85}>
            <Text style={styles.logoutText}>{t("common.logout")}</Text>
          </TouchableOpacity>
        </View>


        <TouchableOpacity style={styles.homeBubbleWrapper} onPress={() => router.push("/")} activeOpacity={0.85}>
          <LinearGradient
            colors={["rgba(255,255,255,0.9)", "rgba(180,220,255,0.5)"] as const}
            style={styles.navBubble}
          >
            <Text style={{ fontSize: 24 }}>🏠</Text>
          </LinearGradient>
        </TouchableOpacity>


        <TouchableOpacity style={styles.settingsBubbleWrapper} onPress={() => router.push("/messages")} activeOpacity={0.85}>
          <LinearGradient
            colors={["rgba(255,255,255,0.9)", "rgba(180,220,255,0.5)"] as const}
            style={styles.navBubble}
          >
            <Text style={{ fontSize: 24 }}>💬</Text>
          </LinearGradient>
        </TouchableOpacity>


        {/* ✅ Emoji phrase editor modal (hard 35-char cap + live counter) */}
        <Modal visible={editOpen} transparent animationType="fade" onRequestClose={closeEditor}>
          <Pressable style={styles.modalBackdrop} onPress={closeEditor} />
          <View style={styles.modalCenter}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>
                {t("settings.phraseForEmoji", { emoji: editEmoji ?? "" })}
              </Text>
              <Text style={styles.modalSub}>{t("settings.emojiPromptBody")}</Text>


              <View style={styles.editInputRow}>
                <TextInput
                  value={editValue}
                  onChangeText={(txt) => {
                    // ✅ hard stop (even if paste somehow bypasses maxLength)
                    const capped = txt.length > MAX_EMOJI_PHRASE_LEN ? txt.slice(0, MAX_EMOJI_PHRASE_LEN) : txt;
                    setEditValue(capped);
                  }}
                  maxLength={MAX_EMOJI_PHRASE_LEN}
                  autoFocus
                  placeholder={t("settings.editPhrasePlaceholder")}
                  placeholderTextColor="rgb(255, 255, 255)"
                  style={styles.editInput}
                />
                <Text style={styles.charCount}>
                  {editValue.length}/{MAX_EMOJI_PHRASE_LEN}
                </Text>
              </View>


              <View style={styles.modalButtons}>
                <TouchableOpacity style={styles.modalBtnGhost} onPress={closeEditor} activeOpacity={0.85}>
                  <Text style={styles.modalBtnGhostText}>{t("common.cancel")}</Text>
                </TouchableOpacity>


                <TouchableOpacity
                  style={styles.modalBtn}
                  onPress={saveEditor}
                  activeOpacity={0.85}
                  disabled={!editValue || editValue.length === 0}
                >
                  <Text style={styles.modalBtnText}>{t("common.save")}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </View>
  );
}


const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#ff0015ff" },
  overlay: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0)" },


  langWrapper: {
    position: "absolute",
    top: 50,
    left: 20,
    zIndex: 60,
  },


  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },


  emojiButton: {
    width: "60%",
    paddingVertical: 10,
    paddingHorizontal: 32,
    borderRadius: 12,
    backgroundColor: "#18bd03ff",
    marginBottom: 16,
  },
  emojiButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 1,
    marginLeft: 18,
  },
  emojiButtonSub: { color: "#ffffffff", fontSize: 12, marginLeft: 40 },


  emojiPanel: {
    width: "70%",
    maxHeight: 260,
    borderRadius: 16,
    backgroundColor: "#18bd03ff",
    padding: 12,
    marginBottom: 20,
  },


  emojiPanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 8,
  },


  emojiPanelTitle: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
    flexShrink: 1,
  },


  syncPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.25)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  syncPillText: { color: "#fff", fontWeight: "800", fontSize: 12 },


  emojiScroll: { maxHeight: 180 },
  emojiScrollContent: { paddingBottom: 6 },
  emojiRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ff0d0dff",
  },
  emojiChar: { fontSize: 20, width: 34 },
  emojiPhrase: { flex: 1, color: "#ffffff", fontSize: 13 },


  recordButton: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    backgroundColor: "#18bd03ff",
    marginBottom: 16,
  },
  recordText: { color: "white", fontSize: 16, fontWeight: "600" },


  logoutButton: {
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 12,
    backgroundColor: "#18bd03ff",
  },
  logoutText: { color: "white", fontSize: 16, fontWeight: "600" },


  navBubble: {
    width: 60,
    height: 60,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
  },
  homeBubbleWrapper: { position: "absolute", left: 40, bottom: 35, zIndex: 10 },
  settingsBubbleWrapper: { position: "absolute", right: 40, bottom: 35, zIndex: 10 },


  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
  },
  modalCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#ff0015ff",
    borderRadius: 16,
    padding: 14,
  },
  modalTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 6,
  },
  modalSub: {
    color: "rgb(255, 255, 255)",
    fontSize: 12,
    marginBottom: 10,
  },


  editInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  editInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#fff",
    fontSize: 14,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  charCount: {
    color: "rgba(255,255,255,0.9)",
    fontWeight: "900",
    fontSize: 12,
    minWidth: 54,
    textAlign: "right",
  },


  modalButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 12,
  },
  modalBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "rgb(255, 255, 255)",
  },
  modalBtnText: { color: "#ff0015ff", fontWeight: "900" },


  modalBtnGhost: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "rgb(255, 255, 255)",
  },
  modalBtnGhostText: { color: "#ff0015ff", fontWeight: "900" },
});


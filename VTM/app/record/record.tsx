// app/record/record.tsx
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Audio } from "expo-av";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { apiFetch, uploadVoiceSample } from "../../lib/api";


const REQUIRED_MS = 90_000; // 1:30
const TICK_MS = 250;
const TOLERANCE_MS = 1500;


type Phase = "idle" | "clearing" | "recording" | "uploading" | "committing";


function formatMs(ms: number) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}


export default function RecordScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  
  const scriptParagraphs = t("record.voiceScriptParagraphs", {
  returnObjects: true,
  }) as string[];

  const recordingRef = useRef<Audio.Recording | null>(null);


  const [phase, _setPhase] = useState<Phase>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);


  // refs avoid stale state in timeouts
  const phaseRef = useRef<Phase>("idle");
  const finishingRef = useRef(false);
  const startAtRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);


  const setPhase = (p: Phase) => {
    phaseRef.current = p;
    _setPhase(p);
  };


  function clearTimers() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    timeoutRef.current = null;
    intervalRef.current = null;
  }


  useEffect(() => {
    return () => {
      clearTimers();
      const r = recordingRef.current;
      recordingRef.current = null;
      if (r) r.stopAndUnloadAsync().catch(() => {});
    };
  }, []);


  // ✅ shows a "Clearing..." phase while server deletes old voice + samples
  async function resetVoiceBeforeRecording() {
    try {
      setPhase("clearing");
      await apiFetch("/api/me/voice/reset", { method: "POST" });
      return true;
    } catch (err: any) {
      console.error("voice reset failed:", err);
      setPhase("idle");
      Alert.alert((t("record.resetFailedTitle")), err?.message ?? t("record.resetFailedBody"));
      return false;
    }
  }


  async function startRecording() {

    

    if (phaseRef.current !== "idle") return;


    try {
      finishingRef.current = false;


      // ✅ Reset old voice first so we don't burn quota
      const ok = await resetVoiceBeforeRecording();
      if (!ok) return;


      const { status } = await Audio.requestPermissionsAsync();
      if (status !== "granted") {
        setPhase("idle");
        Alert.alert((t("record.micPermissionTitle")), t("record.micPermissionBody"));
        return;
      }


      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });


      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);


      recordingRef.current = recording;
      setPhase("recording");


      startAtRef.current = Date.now();
      setElapsedMs(0);


      intervalRef.current = setInterval(() => {
        const e = Date.now() - startAtRef.current;
        setElapsedMs(Math.min(e, REQUIRED_MS));
      }, TICK_MS);


      timeoutRef.current = setTimeout(() => {
        void finishRecordingAndSubmit("auto");
      }, REQUIRED_MS);
    } catch (err) {
      console.error("startRecording failed:", err);
      setPhase("idle");
      setElapsedMs(0);
      recordingRef.current = null;
      clearTimers();
      Alert.alert((t("record.recordingErrorTitle")), t("record.recordingStartFailed"));
    }
  }


  async function cancelAndRedo() {
    if (phaseRef.current !== "recording") return;
    if (finishingRef.current) return;


    finishingRef.current = true;


    try {
      clearTimers();
      const r = recordingRef.current;
      recordingRef.current = null;


      if (r) await r.stopAndUnloadAsync();


      setPhase("idle");
      setElapsedMs(0);
      finishingRef.current = false;
    } catch (err) {
      console.error("cancelAndRedo failed:", err);
      setPhase("idle");
      setElapsedMs(0);
      finishingRef.current = false;
    }
  }


  async function finishRecordingAndSubmit(trigger: "auto" | "manual") {
    if (phaseRef.current !== "recording") return;
    if (finishingRef.current) return;
    finishingRef.current = true;


    try {
      clearTimers();


      const r = recordingRef.current;
      recordingRef.current = null;


      if (!r) {
        setPhase("idle");
        setElapsedMs(0);
        finishingRef.current = false;
        return;
      }


      // ✅ Don’t rely on Expo durationMillis; compute from our timer
      const rawMs = Math.max(0, Date.now() - startAtRef.current);
      const computedMs = trigger === "auto" ? REQUIRED_MS : Math.min(rawMs, REQUIRED_MS);


      // if they tapped “Stop & Submit” too early, reject
      if (trigger === "manual" && computedMs < REQUIRED_MS - TOLERANCE_MS) {
        await r.stopAndUnloadAsync().catch(() => {});
        setPhase("idle");
        setElapsedMs(0);
        finishingRef.current = false;
        Alert.alert((t("record.tooShortTitle")), t("record.tooShortBody"));
        return;
      }


      await r.stopAndUnloadAsync();
      const uri = r.getURI();


      if (!uri) {
        setPhase("idle");
        setElapsedMs(0);
        finishingRef.current = false;
        Alert.alert((t("record.recordingErrorTitle")), t("record.noFileBody"));
        return;
      }


      // Upload
      setPhase("uploading");


      const uploadJson: any = await uploadVoiceSample(uri, computedMs);


      const serverTotalMs = Number(uploadJson?.voiceSampleMs ?? NaN);
      if (!Number.isFinite(serverTotalMs) || serverTotalMs < REQUIRED_MS) {
        setPhase("idle");
        setElapsedMs(0);
        finishingRef.current = false;


       Alert.alert(
        t("record.uploadCountTitle"),
        t("record.uploadCountBody")
      );
        return;
      }


      await apiFetch("/api/me/voice/commit", {
        method: "POST",
      });


      setPhase("idle");
      setElapsedMs(0);
      finishingRef.current = false;


      Alert.alert(
        t("record.voiceReadyTitle"),t("record.voiceReadyBody"));
    } catch (err: any) {
      console.error("finishRecordingAndSubmit failed:", err);
      setPhase("idle");
      setElapsedMs(0);
      finishingRef.current = false;
      Alert.alert((t("record.genericErrorTitle")), err?.message ?? t("record.genericErrorBody"));
    }
  }


  const isBusy = phase === "clearing" || phase === "uploading" || phase === "committing";
  const isRecording = phase === "recording";


  const mainButtonLabel =
  phase === "idle"
    ? t("record.startRecording")
    : phase === "clearing"
    ? t("record.clearing")
    : phase === "recording"
    ? t("record.stopAndSubmit")
    : phase === "uploading"
    ? t("record.uploading")
    : t("record.committing");


  return (
  <SafeAreaView style={ styles.container} edges={["top"]}>
    <View style={styles.container}>
      {/* TOP: fixed header + script (won't move when recording extras appear) */}
      <View style={styles.topFixed}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>{t("record.back")}</Text>
          </Pressable>
        </View>


        <View style={styles.scriptCard}>
          <Text style={styles.scriptTitle}>{t("record.scriptTitle")}</Text>

          <ScrollView
            style={styles.scriptScroll}
            contentContainerStyle={styles.scriptScrollContent}
            showsVerticalScrollIndicator
            nestedScrollEnabled
          >
            {scriptParagraphs.map((paragraph, idx) => (
            <Text
              key={idx}
              style={[
                styles.scriptText,
                idx < scriptParagraphs.length - 1 ? { marginBottom: 14 } : null,
              ]}
              >
            {paragraph}
          </Text>
        ))}
          </ScrollView>



          <Text style={styles.scriptHint}>{t("record.scriptHint")}</Text>
        </View>
      </View>


      {/* BOTTOM: controls */}
      <View style={styles.bottomControls}>
        <Text style={styles.title}>{t("record.screenTitle")}</Text>


        <Pressable
          disabled={isBusy}
          onPress={() => {
            if (phaseRef.current === "idle") void startRecording();
            else if (phaseRef.current === "recording") void finishRecordingAndSubmit("manual");
          }}
          style={({ pressed }) => [
            styles.recordBtn,
            {
              backgroundColor: isBusy ? "#ffffff" : pressed ? "#18bd03ff" : "#ffffff",
              opacity: isBusy ? 0.7 : 1,
            },
          ]}
        >
          <Text style={styles.recordBtnText}>{mainButtonLabel}</Text>
        </Pressable>


        {/* ✅ Reserved space so UI doesn't jump */}
        <View style={[styles.recordingExtras, { opacity: isRecording ? 1 : 0 }]} pointerEvents={isRecording ? "auto" : "none"}>
          <Text style={styles.timerText}>{`${formatMs(elapsedMs)} / 1:30`}</Text>
          <Text style={styles.hintText}>{t("record.autoStops")}</Text>


          <Pressable onPress={() => void cancelAndRedo()} style={styles.redoBtn}>
            <Text style={styles.redoText}>{t("record.cancelRedo")}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  </SafeAreaView>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ff0015ff" },


  // ✅ Top area is fixed; recording extras won't affect it
  topFixed: {
    paddingTop: 8,
    paddingHorizontal: 16,
  },


  header: { paddingBottom: 10 },
  backButton: { alignSelf: "flex-start" },
  backText: { fontSize: 16, fontWeight: "500", color: "#ffffff" },


  // ✅ Script card styles (kept close to your original)
  scriptCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 16,
    padding: 14,
    backgroundColor: "rgb(25, 189, 3)",
    borderWidth: 1,
    borderColor: "rgb(255, 255, 255)",
    marginBottom: 10,
    maxHeight: 555,
  },
  scriptTitle: { color: "#fff", fontWeight: "900", fontSize: 14, marginBottom: 8 },
  scriptScroll: { maxHeight: 320, borderRadius: 12, borderColor: "rgba(255, 255, 255, 0)", borderWidth: 1, padding: 5 },
  scriptScrollContent: { paddingBottom: 10 },
  scriptText: { color: "rgb(255, 255, 255)", fontSize: 14, lineHeight: 20 },
  scriptHint: { marginTop: 10, color: "rgb(255, 255, 255)", fontSize: 12, fontWeight: "700" },


  // ✅ Bottom controls are pinned; no more jumping
  bottomControls: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: 20,
    paddingBottom: 15,
    gap: 10,
  },


  title: { fontSize: 20, fontWeight: "600", marginBottom: 8, color: "#ffffff" },


  recordBtn: {
    paddingVertical: 18,
    paddingHorizontal: 22,
    borderRadius: 999,
    alignItems: "center",
    minWidth: 260,
  },
  recordBtnText: { color: "#ff0015ff", fontSize: 16, fontWeight: "700" },


  // ✅ Always reserve space so start/stop doesn't shift layout
  recordingExtras: {
    height: 110,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },


  timerText: { color: "white", opacity: 0.9, marginTop: 6 },
  hintText: { color: "white", opacity: 0.75 },


  redoBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  redoText: { color: "white", fontWeight: "700" },
});

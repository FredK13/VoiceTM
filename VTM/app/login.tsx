import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { apiJson } from "../lib/api";
import { saveToken, saveUserId } from "../lib/session";
import LanguageDropdown from "./components/LanguageDropdown";
import { useTranslation } from "react-i18next";


type AuthResponse = {
  token: string;
  user: { id: string; username: string };
};


export default function LoginScreen() {
  const router = useRouter();
  const { t } = useTranslation();


  const [mode, setMode] = useState<"login" | "signup">("login");


  const [identifier, setIdentifier] = useState(""); // login: email OR username; signup: email
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState(""); // ✅ signup only
  const [username, setUsername] = useState(""); // ✅ signup only
  const [busy, setBusy] = useState(false);


  // Forgot password modal state
  const [fpOpen, setFpOpen] = useState(false);
  const [fpIdentifier, setFpIdentifier] = useState("");
  const [fpBusy, setFpBusy] = useState(false);


  const BG_RED = "#ff0015ff";
  const PLACEHOLDER = "rgba(255, 255, 255, 0.67)";


  const inputStyle = useMemo(
    () =>
      ({
        borderWidth: 2,
        borderColor: "rgb(255, 255, 255)",
        backgroundColor: BG_RED,
        color: "rgb(255, 255, 255)",
        padding: 12,
        borderRadius: 12,
      } as const),
    []
  );


  async function submit() {
    try {
      setBusy(true);


      const cleanIdentifier = identifier.trim();
      const cleanPassword = password.trim();


      if (!cleanIdentifier || !cleanPassword) {
        Alert.alert(t("auth.missingInfoTitle"), t("auth.missingInfoBody"));
        return;
      }


      if (mode === "signup") {
        const cleanUsername = username.trim();


        if (!cleanUsername) {
          Alert.alert(t("auth.missingInfoTitle"), t("auth.usernameRequired"));
          return;
        }


        if (!cleanIdentifier.includes("@")) {
          Alert.alert(t("auth.emailRequiredTitle"), t("auth.emailRequiredBody"));
          return;
        }


        if (cleanPassword.length < 8) {
          Alert.alert(t("auth.weakPasswordTitle"), t("auth.weakPasswordBody"));
          return;
        }


        if (cleanPassword !== confirmPassword.trim()) {
          Alert.alert(t("auth.passwordsDontMatchTitle"), t("auth.passwordsDontMatchBody"));
          return;
        }


        const res = await apiJson<AuthResponse>("/api/auth/signup", {
          method: "POST",
          json: {
            email: cleanIdentifier.toLowerCase(),
            username: cleanUsername,
            password: cleanPassword,
            confirmPassword: confirmPassword.trim(),
          },
        });


        await saveToken(res.token);
        await saveUserId(res.user.id);
        router.replace("/");
        return;
      }


      // login
      const res = await apiJson<AuthResponse>("/api/auth/login", {
        method: "POST",
        json: {
          identifier: cleanIdentifier,
          password: cleanPassword,
        },
      });


      await saveToken(res.token);
      await saveUserId(res.user.id);
      router.replace("/");
    } catch (err: any) {
      Alert.alert(t("auth.authFailedTitle"), err?.message ?? t("auth.authFailedBody"));
    } finally {
      setBusy(false);
    }
  }


  function openForgotPassword() {
    setFpIdentifier(identifier.trim());
    setFpOpen(true);
  }


  function closeForgotPassword() {
    if (fpBusy) return;
    setFpOpen(false);
  }


  async function submitForgotPassword() {
    const clean = fpIdentifier.trim();
    setFpBusy(true);


    try {
      await apiJson<{ ok: true }>("/api/auth/forgot-password", {
        method: "POST",
        json: { identifier: clean },
      });
    } catch {
      // swallow (no leaks)
    } finally {
      setFpBusy(false);
      setFpOpen(false);


      Alert.alert(t("auth.checkEmailTitle"), t("auth.checkEmailBody"));
    }
  }


  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        padding: 24,
        gap: 12,
        backgroundColor: BG_RED,
      }}
    >
      {/* ✅ Language dropdown upper-left */}
      <View style={{ position: "absolute", top: 50, left: 20, zIndex: 60 }}>
        <LanguageDropdown />
      </View>


      <Text style={{ fontSize: 28, fontWeight: "800", color: "rgb(255, 255, 255)" }}>
        {mode === "signup" ? t("auth.createAccount") : t("auth.login")}
      </Text>


      {mode === "signup" && (
        <TextInput
          value={username}
          onChangeText={setUsername}
          placeholder={t("auth.usernamePlaceholder")}
          placeholderTextColor={PLACEHOLDER}
          autoCapitalize="none"
          style={inputStyle}
        />
      )}


      <TextInput
        value={identifier}
        onChangeText={setIdentifier}
        placeholder={mode === "signup" ? t("auth.emailPlaceholder") : t("auth.emailOrUsernamePlaceholder")}
        placeholderTextColor={PLACEHOLDER}
        autoCapitalize="none"
        keyboardType={mode === "signup" ? "email-address" : "default"}
        style={inputStyle}
      />


      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder={t("auth.passwordPlaceholder")}
        placeholderTextColor={PLACEHOLDER}
        secureTextEntry
        style={inputStyle}
      />


      {mode === "signup" && (
        <TextInput
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder={t("auth.confirmPasswordPlaceholder")}
          placeholderTextColor={PLACEHOLDER}
          secureTextEntry
          style={inputStyle}
        />
      )}


      <Pressable
        onPress={submit}
        disabled={busy}
        style={({ pressed }) => ({
          backgroundColor: pressed ? "#00d13b" : "#ffffffa1",
          padding: 14,
          borderRadius: 12,
          alignItems: "center",
          opacity: busy ? 0.6 : 1,
        })}
      >
        <Text style={{ color: BG_RED, fontSize: 16, fontWeight: "700" }}>
          {busy
            ? t("auth.pleaseWait")
            : mode === "signup"
            ? t("auth.signUp")
            : t("auth.login")}
        </Text>
      </Pressable>


      <Pressable
        onPress={() => setMode((m) => (m === "login" ? "signup" : "login"))}
        disabled={busy}
        style={{ padding: 10, alignItems: "center" }}
      >
        <Text style={{ color: "rgb(255, 255, 255)", fontWeight: "700" }}>
          {mode === "login" ? t("auth.needAccount") : t("auth.haveAccount")}
        </Text>
      </Pressable>


      {mode === "login" && (
        <Pressable
          onPress={openForgotPassword}
          disabled={busy}
          style={{ padding: 6, alignItems: "center", opacity: busy ? 0.7 : 1 }}
        >
          <Text style={{ color: "rgba(255,255,255,0.9)", fontWeight: "800" }}>
            {t("auth.forgotPassword")}
          </Text>
        </Pressable>
      )}


      {/* Forgot Password Modal */}
      <Modal visible={fpOpen} transparent animationType="fade" onRequestClose={closeForgotPassword}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.55)",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <View
            style={{
              backgroundColor: BG_RED,
              borderRadius: 16,
              padding: 16,
              borderWidth: 2,
              borderColor: "rgba(255,255,255,0.35)",
              gap: 12,
            }}
          >
            <Text style={{ color: "white", fontSize: 18, fontWeight: "900" }}>
              {t("auth.resetPasswordTitle")}
            </Text>


            <Text style={{ color: "rgba(255,255,255,0.85)" }}>
              {t("auth.resetPasswordBody")}
            </Text>


            <TextInput
              value={fpIdentifier}
              onChangeText={setFpIdentifier}
              placeholder={t("auth.emailOrUsernamePlaceholder")}
              placeholderTextColor={PLACEHOLDER}
              autoCapitalize="none"
              keyboardType="email-address"
              style={inputStyle}
              editable={!fpBusy}
            />


            <Pressable
              onPress={submitForgotPassword}
              disabled={fpBusy}
              style={({ pressed }) => ({
                backgroundColor: pressed ? "#00d13b" : "#ffffffa1",
                padding: 14,
                borderRadius: 12,
                alignItems: "center",
                opacity: fpBusy ? 0.6 : 1,
              })}
            >
              <Text style={{ color: BG_RED, fontSize: 16, fontWeight: "800" }}>
                {fpBusy ? t("auth.sending") : t("auth.sendResetLink")}
              </Text>
            </Pressable>


            <Pressable
              onPress={closeForgotPassword}
              disabled={fpBusy}
              style={{ padding: 10, alignItems: "center", opacity: fpBusy ? 0.6 : 1 }}
            >
              <Text style={{ color: "rgba(255,255,255,0.9)", fontWeight: "800" }}>
                {t("common.cancel")}
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
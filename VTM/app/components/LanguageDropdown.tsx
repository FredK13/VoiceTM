// app/components/LanguageDropdown.tsx
import React from "react";
import { Alert, TouchableOpacity, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGS, setAppLanguage, SupportedLangCode } from "../../lib/i18n";


export default function LanguageDropdown() {
  const { i18n, t } = useTranslation();


  const current = (i18n.language || "en") as SupportedLangCode;
  const currentLabel =
    SUPPORTED_LANGS.find((l) => l.code === current)?.label ?? t("language.currentFallback");


  const open = () => {
    Alert.alert(
      t("language.title"),
      t("language.choose"),
      [
        ...SUPPORTED_LANGS.map((l) => ({
          text: l.label,
          onPress: () => setAppLanguage(l.code),
        })),
        { text: t("language.cancel"), style: "cancel" },
      ],
      { cancelable: true }
    );
  };


  return (
    <TouchableOpacity onPress={open} activeOpacity={0.85} style={styles.pill}>
      <Text style={styles.text}>{currentLabel}</Text>
    </TouchableOpacity>
  );
}


const styles = StyleSheet.create({
  pill: {
    backgroundColor: "rgba(0,0,0,0.78)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  text: { color: "white", fontWeight: "900", fontSize: 12 },
});


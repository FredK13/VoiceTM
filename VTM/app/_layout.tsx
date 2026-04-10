// app/_layout.tsx
import "../lib/i18n";
import { initAppLanguage } from "../lib/i18n";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Stack } from "expo-router";

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initAppLanguage().finally(() => setReady(true));
  }, []);

  if (!ready) return <View style={{ flex: 1, backgroundColor: "#ff0015ff" }} />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
// app/index.tsx
import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";

import LanguageDropdown from "../components/LanguageDropdown";
import ProfileEntryPoint from "../components/ProfileEntryPoint";

export default function HomeScreen() {
  const router = useRouter();

  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      {/* Language dropdown (upper-left) */}
      <View style={styles.langWrapper}>
        <LanguageDropdown />
      </View>

      <ProfileEntryPoint
        t={t}
        router={router}
        refreshConversations={async () => []}
      />


      {/* bottom-left Messages bubble */}
      <TouchableOpacity style={styles.homeBubbleWrapper} onPress={() => router.push("/messages")} activeOpacity={0.85}>
        <LinearGradient colors={["rgba(255,255,255,0.9)", "rgba(180,220,255,0.5)"]} style={styles.navBubble}>
          <Text style={{ fontSize: 24 }}>{"💬"}</Text>
        </LinearGradient>
      </TouchableOpacity>

      {/* bottom-right Settings bubble */}
      <TouchableOpacity style={styles.settingsBubbleWrapper} onPress={() => router.push("/settings")} activeOpacity={0.85}>
        <LinearGradient colors={["rgba(255,255,255,0.9)", "rgba(180,220,255,0.5)"]} style={styles.navBubble}>
          <Text style={{ fontSize: 24 }}>{"⚙️"}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ff0015ff",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },

  // upper-left language dropdown wrapper
  langWrapper: {
    position: "absolute",
    top: 50,
    left: 20,
    zIndex: 60,
  },

  // bottom nav bubbles
  navBubble: {
    width: 60,
    height: 60,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
  },
  homeBubbleWrapper: {
    position: "absolute",
    left: 40,
    bottom: 35,
    zIndex: 10,
  },
  settingsBubbleWrapper: {
    position: "absolute",
    right: 40,
    bottom: 35,
    zIndex: 10,
  },
});


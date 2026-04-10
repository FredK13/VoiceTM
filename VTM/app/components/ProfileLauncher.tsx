import React from "react";
import { View, Text, TouchableOpacity, Image, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";


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


type Props = {
  avatarUrl: string | null;
  username: string;
  badgeCount: number;
  disabled?: boolean;
  onPress: () => void;
};


export default function ProfileLauncher({
  avatarUrl,
  username,
  badgeCount,
  disabled = false,
  onPress,
}: Props) {
  return (
    <View style={styles.profileWrapper} pointerEvents={disabled ? "none" : "auto"}>
      <View style={styles.profileBadgeHost}>
        <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
          <View style={styles.profileOuterBubble}>
            <LinearGradient colors={GLASS_COLORS} style={StyleSheet.absoluteFill} />
            <LinearGradient colors={HIGHLIGHT_COLORS} style={StyleSheet.absoluteFill} />


            <View style={styles.profileInnerCircle}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.profileAvatarImage} />
              ) : (
                <Text
                  style={styles.profileInnerText}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.4}
                >
                  {initialFromUsername(username, "Y")}
                </Text>
              )}
            </View>
          </View>
        </TouchableOpacity>


        {badgeCount > 0 && (
          <View style={styles.badgeOutside} pointerEvents="none">
            <Text style={styles.badgeOutsideText}>
              {badgeCount > 99 ? "99+" : String(badgeCount)}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}


const styles = StyleSheet.create({
  profileWrapper: {
    position: "absolute",
    top: 52,
    right: 16,
    zIndex: 40,
  },


  profileBadgeHost: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },


  profileOuterBubble: {
    width: 60,
    height: 60,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },


  profileInnerCircle: {
    width: 55,
    height: 55,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.65)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },


  profileAvatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 999,
  },


  profileInnerText: {
    color: "#ff0015ff",
    fontWeight: "900",
    fontSize: 22,
    paddingHorizontal: 6,
    includeFontPadding: false,
  },


  badgeOutside: {
    position: "absolute",
    top: -4,
    right: -6,
    minWidth: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: "#00d13b",
    borderWidth: 2,
    borderColor: "white",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },


  badgeOutsideText: {
    color: "#111",
    fontSize: 11,
    fontWeight: "900",
  },
});


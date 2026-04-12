import React from "react";
import { Text, TouchableOpacity, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";


const GLASS_COLORS = ["rgba(255, 255, 255, 0.7)", "rgba(180,220,255,0.5)"] as const;
const HIGHLIGHT_COLORS = ["rgba(255,255,255,0.9)", "rgba(180,220,255,0.5)"] as const;


type Props = {
  label?: string;
  onPress: () => void;
};


export default function ContactsBlockedList({
  label = "Blocked",
  onPress,
}: Props) {
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={styles.glassPill}>
      <LinearGradient colors={GLASS_COLORS} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={HIGHLIGHT_COLORS} style={StyleSheet.absoluteFill} />
      <Text style={styles.glassPillText}>{label}</Text>
    </TouchableOpacity>
  );
}


const styles = StyleSheet.create({
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
});

import React from "react";
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { Conversation } from "../../lib/types";


const INNER = 1;
const OFFLINE_RING_WIDTH = 4;
const ONLINE_RING_WIDTH = 4;


const GLASS_COLORS = [
  "rgba(255, 255, 255, 0.58)",
  "rgba(255, 255, 255, 0.2)",
  "rgba(180, 220, 255, 0.35)",
  "rgba(255, 180, 220, 0.25)",
] as const;


const HIGHLIGHT_COLORS = ["rgba(255,255,255,0.35)", "rgba(255,255,255,0)"] as const;

export type MovingBubble = Conversation & {
  size: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

type Props = {
  bubbles: MovingBubble[];
  disabled?: boolean;
  nowMs: number;
  isUserOnline: (userId: string, nowMs?: number) => boolean;
  onPressBubble: (bubble: MovingBubble) => void;
  onLongPressBubble: (bubble: MovingBubble) => void;
  
};


function FloatingConversationField({
  bubbles,
  disabled = false,
  nowMs,
  isUserOnline,
  onPressBubble,
  onLongPressBubble,
  
}: Props) {

  return (
    <>
      {bubbles.map((b) => {
        const displayName = (b.otherUsername || b.title || "yap").trim();
        const innerSize = b.size * INNER;
        const nameFont = Math.max(10, Math.floor(innerSize * 0.22));
        const bubbleUserId = b.otherUserId ?? null;
        const bubbleOnline = bubbleUserId ? isUserOnline(bubbleUserId, nowMs) : false;


        return (
          <View
            key={b.id}
            pointerEvents={disabled ? "none" : "auto"}
            style={[styles.bubbleWrapper, { width: b.size, height: b.size, left: b.x, top: b.y }]}
          >
            <TouchableOpacity
              style={styles.touchArea}
              activeOpacity={0.9}
              onPress={() => onPressBubble(b)}
              onLongPress={() => onLongPressBubble(b)}
              delayLongPress={700}
            >
              {b.avatarUrl ? (
                <View
  style={{
    width: innerSize,
    height: innerSize,
    borderRadius: innerSize / 2,
    alignItems: "center",
    justifyContent: "center",
  }}
>
  <View
    style={[
      {
        width: innerSize,
        height: innerSize,
        borderRadius: innerSize / 2,
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
      },
      bubbleOnline
        ? { backgroundColor: "#00d13b", padding: ONLINE_RING_WIDTH }
        : null,
    ]}
  >
    {!bubbleOnline && (
      <>
        <LinearGradient colors={GLASS_COLORS} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={HIGHLIGHT_COLORS} style={StyleSheet.absoluteFill} />
      </>
    )}


    <View
      style={[
        styles.bubbleAvatarInner,
        {
          width: innerSize - (bubbleOnline ? ONLINE_RING_WIDTH * 2 : OFFLINE_RING_WIDTH * 2),
          height: innerSize - (bubbleOnline ? ONLINE_RING_WIDTH * 2 : OFFLINE_RING_WIDTH * 2),
          borderRadius:
            (innerSize - (bubbleOnline ? ONLINE_RING_WIDTH * 2 : OFFLINE_RING_WIDTH * 2)) / 2,
        },
        !bubbleOnline && {
          overflow: "hidden",
        },
      ]}
    >
      <Image source={{ uri: b.avatarUrl }} style={styles.bubbleAvatarImage} />
    </View>
  </View>
</View>


              ) : (
                <View
                  style={[
                    styles.bubbleFallback,
                    { width: innerSize, height: innerSize, borderRadius: innerSize / 2 },
                  ]}
                >
                  <LinearGradient colors={GLASS_COLORS} style={StyleSheet.absoluteFill} />
                  <LinearGradient colors={HIGHLIGHT_COLORS} style={StyleSheet.absoluteFill} />
                  <Text
                    style={[styles.bubbleNameText, { fontSize: nameFont }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.5}
                  >
                    {displayName}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        );
      })}
    </>
  );
}


const styles = StyleSheet.create({
  bubbleWrapper: { position: "absolute" },
  touchArea: { flex: 1, alignItems: "center", justifyContent: "center" },


  bubbleAvatarWrap: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },

  bubbleAvatarInner: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  bubbleAvatarImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
    borderRadius: 999,
  },


  bubbleFallback: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },


  bubbleNameText: {
    color: "white",
    fontWeight: "900",
    paddingHorizontal: 6,
    textAlign: "center",
  },
})

export default React.memo(FloatingConversationField);

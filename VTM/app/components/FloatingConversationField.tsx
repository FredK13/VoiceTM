import React, { useEffect, useMemo, useState } from "react";
import {
  Dimensions,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { Conversation } from "../../lib/types";


const { width, height } = Dimensions.get("window");


const BUBBLE_SIZE = width * 0.21;
const SPEED_MIN = 15;
const SPEED_MAX = 45;
const TOP_BOUNDARY = height * 0.1;
const BOTTOM_BOUNDARY = height * 0.88;


const INNER = 0.77;
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


function createBubbleForConversation(c: Conversation): MovingBubble {
  const size = BUBBLE_SIZE;
  const speed = SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN);
  const angle = Math.random() * Math.PI * 2;


  return {
    ...c,
    size,
    x: Math.random() * (width - size),
    y: TOP_BOUNDARY + Math.random() * (BOTTOM_BOUNDARY - TOP_BOUNDARY - size),
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
  };
}


export function createInitialBubbles(source: Conversation[]): MovingBubble[] {
  return source.map(createBubbleForConversation);
}


type Props = {
  conversations: Conversation[];
  disabled?: boolean;
  nowMs: number;
  isUserOnline: (userId: string, nowMs?: number) => boolean;
  onPressBubble: (bubble: MovingBubble) => void;
  onLongPressBubble: (bubble: MovingBubble) => void;
};


export default function FloatingConversationField({
  conversations,
  disabled = false,
  nowMs,
  isUserOnline,
  onPressBubble,
  onLongPressBubble,
}: Props) {
  const [bubbles, setBubbles] = useState<MovingBubble[]>(() => createInitialBubbles(conversations));


  useEffect(() => {
    setBubbles((prev) => {
      const prevMap = new Map(prev.map((b) => [b.id, b]));
      return conversations.map((c) => {
        const existing = prevMap.get(c.id);
        if (!existing) return createBubbleForConversation(c);


        return {
          ...existing,
          ...c,
        };
      });
    });
  }, [conversations]);


  useEffect(() => {
    let animationFrame = 0;
    let lastTime = Date.now();


    const step = () => {
      const now = Date.now();
      const dt = (now - lastTime) / 1000;
      lastTime = now;


      setBubbles((prev) => {
        const next = prev.map((b) => ({ ...b }));


        for (const b of next) {
          b.x += b.vx * dt;
          b.y += b.vy * dt;


          if (b.x < 0) {
            b.x = 0;
            b.vx *= -1;
          } else if (b.x > width - b.size) {
            b.x = width - b.size;
            b.vx *= -1;
          }


          if (b.y < TOP_BOUNDARY) {
            b.y = TOP_BOUNDARY;
            b.vy *= -1;
          } else if (b.y > BOTTOM_BOUNDARY - b.size) {
            b.y = BOTTOM_BOUNDARY - b.size;
            b.vy *= -1;
          }
        }


        for (let i = 0; i < next.length; i++) {
          for (let j = i + 1; j < next.length; j++) {
            const a = next[i];
            const b = next[j];


            const ax = a.x + a.size / 2;
            const ay = a.y + a.size / 2;
            const bx = b.x + b.size / 2;
            const by = b.y + b.size / 2;


            const dx = bx - ax;
            const dy = by - ay;


            const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
            const minDist = (a.size + b.size) / 2;


            if (dist < minDist) {
              const overlap = minDist - dist;
              const nx = dx / dist;
              const ny = dy / dist;


              a.x -= (nx * overlap) / 2;
              a.y -= (ny * overlap) / 2;
              b.x += (nx * overlap) / 2;
              b.y += (ny * overlap) / 2;


              const tempVx = a.vx;
              const tempVy = a.vy;
              a.vx = b.vx;
              a.vy = b.vy;
              b.vx = tempVx;
              b.vy = tempVy;
            }
          }
        }


        return next;
      });


      animationFrame = requestAnimationFrame(step);
    };


    animationFrame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animationFrame);
  }, []);


  const renderedBubbles = useMemo(() => bubbles, [bubbles]);


  return (
    <>
      {renderedBubbles.map((b) => {
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
});

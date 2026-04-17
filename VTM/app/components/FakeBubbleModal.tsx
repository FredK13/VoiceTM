import React from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MAX_FAKE_BUBBLES, type UnifiedBubble } from "../hooks/useUnifiedBubbles";


const GLASS_COLORS = [
  "rgba(255, 255, 255, 0.58)",
  "rgba(255, 255, 255, 0.2)",
  "rgba(180, 220, 255, 0.35)",
  "rgba(255, 180, 220, 0.25)",
] as const;


const HIGHLIGHT_COLORS = [
  "rgba(255,255,255,0.35)",
  "rgba(255,255,255,0)",
] as const;



type Props = {
  visible: boolean;
  onClose: () => void;
  t: (key: string, options?: any) => string;
  fakeBubbles: UnifiedBubble[];
  onAddFakeBubble: () => void | Promise<void>;
  onPopFakeBubble: (id: string) => void | Promise<void>;
  popMode?: boolean;
};


function FakeBubbleModal({
  visible,
  onClose,
  t,
  fakeBubbles,
  onAddFakeBubble,
  onPopFakeBubble,
  popMode = false,
}: Props) {


  return (
    <>
      {fakeBubbles.map((b) => (
        <View
          key={b.id}
          pointerEvents="box-none"
          style={[
            styles.fakeBubbleWrap,
            {
              left: b.x,
              top: b.y,
              width: b.size,
              height: b.size,
            },
          ]}
        >
          <TouchableOpacity
            activeOpacity={0.92}
            style={styles.fakeBubbleTouch}
            onPress={() => {
              if (popMode) onPopFakeBubble(b.id);
            }}
            onLongPress={() => onPopFakeBubble(b.id)}
            delayLongPress={500}
          >
            <View
              style={[
                styles.fakeBubbleOuter,
                {
                  width: b.size,
                  height: b.size,
                  borderRadius: b.size / 2,
                },
              ]}
            >
              <LinearGradient colors={GLASS_COLORS} style={StyleSheet.absoluteFill} />
              <LinearGradient colors={HIGHLIGHT_COLORS} style={StyleSheet.absoluteFill} />


              <View
                style={[
                  styles.fakeBubbleInner,
                  {
                    width: b.size * 0.9,
                    height: b.size * 0.9,
                    borderRadius: (b.size * 0.9) /2,
                  },
                ]}
              >
                <LinearGradient colors={GLASS_COLORS} style={StyleSheet.absoluteFill} />
                <LinearGradient colors={HIGHLIGHT_COLORS} style={StyleSheet.absoluteFill} />
              </View>
            </View>
          </TouchableOpacity>
        </View>
      ))}


      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />


          <View style={styles.panel}>
            <View style={styles.header}>
              <Text style={styles.headerTitle}>🫧</Text>
              <TouchableOpacity onPress={onClose} activeOpacity={0.8}>
                <Text style={styles.closeText}>X</Text>
              </TouchableOpacity>
            </View>


            <Text style={styles.title}>Create Bubbles</Text>
            <Text style={styles.body}>
              {fakeBubbles.length} / {MAX_FAKE_BUBBLES}
            </Text>


            <View style={styles.actionCol}>
              <TouchableOpacity
                style={styles.primaryBtn}
                activeOpacity={0.85}
                onPress={onAddFakeBubble}
              >
                <Text style={styles.primaryBtnText}>Add bubble</Text>
              </TouchableOpacity>

              <Text style={styles.helperText}>
                long-press to remove bubbles
              </Text>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}


const styles = StyleSheet.create({
  fakeBubbleWrap: {
    position: "absolute",
    zIndex: 12,
  },


  fakeBubbleTouch: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },


  fakeBubbleOuter: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },


  fakeBubbleInner: {
    overflow: "hidden",
    opacity: 0.72,
  },


  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 18,
  },


  panel: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "rgba(255, 255, 255, 0.6)",
    borderWidth: 1,
    borderColor: "#000000",
    borderRadius: 22,
    padding: 16,
  },


  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },


  headerTitle: {
    fontSize: 22,
  },


  closeText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#000000",
  },


  title: {
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 8,
    color: "#000000",
  },


  body: {
    opacity: 0.75,
    fontSize: 14,
    marginBottom: 14,
  },


  actionCol: {
    gap: 10,
  },


  primaryBtn: {
    backgroundColor: "#00d13b",
    borderWidth: 1,
    borderColor: "#000000",
    borderRadius: 999,
    paddingVertical: 11,
    paddingHorizontal: 14,
    alignItems: "center",
  },


  primaryBtnText: {
    color: "#fff",
    fontWeight: "900",
  },


  secondaryBtn: {
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingVertical: 11,
    paddingHorizontal: 14,
    alignItems: "center",
  },


  secondaryBtnText: {
    color: "#111",
    fontWeight: "900",
  },


  helperText: {
    marginTop: 4,
    opacity: 0.65,
    fontSize: 12,
  },
})

export default React.memo(FakeBubbleModal);

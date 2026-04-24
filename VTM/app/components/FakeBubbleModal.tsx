import React from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { MAX_FAKE_BUBBLES, type BubbleItem } from "../hooks/useBubbles";


type Props = {
  visible: boolean;
  onClose: () => void;
  t: (key: string, options?: any) => string;
  fakeBubbles: BubbleItem[];
  onAddFakeBubble: () => void | Promise<void>;
  
};


function FakeBubbleModal({
  visible,
  onClose,
  t,
  fakeBubbles,
  onAddFakeBubble,
}: Props) {


  return (
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
  );
}


const styles = StyleSheet.create({

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

  helperText: {
    marginTop: 4,
    opacity: 0.65,
    fontSize: 12,
  },
})

export default React.memo(FakeBubbleModal);

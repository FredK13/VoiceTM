import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
} from "react-native";


type Props = {
  visible: boolean;
  onClose: () => void;
  t: (key: string, options?: any) => string;
};


export default function StarredModal({ visible, onClose, t }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />


        <View style={styles.panel}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>⭐</Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.8}>
              <Text style={styles.closeText}>X</Text>
            </TouchableOpacity>
          </View>


          <Text style={styles.title}>{t("common.comingSoon")}</Text>
          <Text style={styles.body}>{t("common.comingSoon")}</Text>
        </View>
      </View>
    </Modal>
  );
}


const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 18,
  },


  panel: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "rgba(255,255,255,0.94)",
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
  },


  title: {
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 8,
  },


  body: {
    opacity: 0.75,
    fontSize: 14,
  },
});



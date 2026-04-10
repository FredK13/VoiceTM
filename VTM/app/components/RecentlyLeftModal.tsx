import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  FlatList,
  RefreshControl,
  Image,
} from "react-native";
import type { RecentlyLeftRow } from "../../lib/types";


type Props = {
  visible: boolean;
  onClose: () => void;
  t: (key: string, options?: any) => string;
  recentlyLeft: RecentlyLeftRow[];
  loadingRecentlyLeft: boolean;
  onRefreshRecentlyLeft: () => void;
  onPressRecentlyLeftUser: (item: RecentlyLeftRow) => void;
};


export default function RecentlyLeftModal({
  visible,
  onClose,
  t,
  recentlyLeft,
  loadingRecentlyLeft,
  onRefreshRecentlyLeft,
  onPressRecentlyLeftUser,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />


        <View style={styles.panel}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{t("common.recentlyLeftTitle")}</Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.8}>
              <Text style={styles.closeText}>X</Text>
            </TouchableOpacity>
          </View>


          <FlatList
            data={recentlyLeft}
            keyExtractor={(r) => r.conversationId}
            refreshControl={
              <RefreshControl
                refreshing={loadingRecentlyLeft}
                onRefresh={onRefreshRecentlyLeft}
                tintColor="#111"
                colors={["#111"]}
              />
            }
            ListEmptyComponent={
              !loadingRecentlyLeft ? (
                <Text style={styles.emptyText}>{t("common.recentlyLeftEmpty")}</Text>
              ) : null
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.row}
                onPress={() => onPressRecentlyLeftUser(item)}
              >
                <View style={styles.rowLeft}>
                  {item.avatarUrl ? (
                    <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Text style={styles.avatarFallbackText}>
                        {(item.otherUsername?.[0] ?? "Y").toUpperCase()}
                      </Text>
                    </View>
                  )}


                  <View style={{ flex: 1 }}>
                    <Text style={styles.username}>@{item.otherUsername}</Text>
                    <Text style={styles.subText}>{t("common.tapToSendRejoin")}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            )}
          />
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
    maxWidth: 440,
    maxHeight: "78%",
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
    fontSize: 18,
    fontWeight: "800",
  },


  closeText: {
    fontSize: 16,
    fontWeight: "800",
  },


  row: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.12)",
  },


  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },


  avatar: {
    width: 42,
    height: 42,
    borderRadius: 999,
  },


  avatarFallback: {
    width: 42,
    height: 42,
    borderRadius: 999,
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
  },


  avatarFallbackText: {
    color: "white",
    fontWeight: "900",
  },


  username: {
    fontWeight: "900",
  },


  subText: {
    opacity: 0.7,
    marginTop: 2,
    fontSize: 12,
  },


  emptyText: {
    paddingVertical: 10,
    opacity: 0.7,
  },
});



// app/hooks/useConversationRequestFlow.ts
import { useCallback } from "react";
import { Alert } from "react-native";
import { apiJson } from "../../lib/api";
import type { RequestResponse } from "../../lib/types";


type Args = {
  t: (key: string, options?: any) => string;
  openConversation: (conversationId: string) => Promise<void> | void;
  openProfile?: () => void;
  refreshAll?: () => Promise<void> | void;
  refreshIncoming?: () => Promise<void> | void;
  refreshOutgoing?: () => Promise<void> | void;
};


export default function useConversationRequestFlow({
  t,
  openConversation,
  openProfile,
  refreshAll,
  refreshIncoming,
  refreshOutgoing,
}: Args) {
  const submitConversationRequest = useCallback(
    async (identifier: string) => {
      const value = identifier.trim();
      if (!value) return;

      const res = await apiJson<RequestResponse>("/api/conversations/request", {
      method: "POST",
      json: { identifier: value },
    });

    if (res.status === "PENDING_ALREADY") {
      await refreshOutgoing?.();
      await refreshAll?.();

      Alert.alert(t("common.pending"), t("common.currentRequestPending"));
      return res;
    }


    if (res.status === "ALREADY_CONNECTED") {
      if (res.conversationId) {
        await openConversation(res.conversationId);
      }
      return res;
    }


    if (res.status === "REJOIN_SENT") {
      await refreshOutgoing?.();
      await refreshAll?.();


      Alert.alert(
        t("common.rejoinRequestSentTitle"),
        t("common.rejoinRequestSentBody"),
        [{ text: t("common.open"), onPress: () => openProfile?.() }]
      );
      return res;
    }


    if (res.status === "INCOMING_PENDING") {
      await refreshIncoming?.();
      await refreshAll?.();


      Alert.alert(
        t("common.requestWaitingTitle"),
        t("common.requestWaitingBody"),
        [
          { text: t("common.open"), onPress: () => openProfile?.() },
          { text: t("common.cancel"), style: "cancel" },
        ]
      );
      return res;
    }


    await refreshOutgoing?.();
    await refreshAll?.();


    Alert.alert(
      t("common.sent"),
      t("common.requestSent"),
      [{ text: t("common.okay"), onPress: () => openProfile?.() }]
    );


    return res;
  },

    [
      t, 
      openConversation, 
      openProfile, 
      refreshAll, 
      refreshIncoming, 
      refreshOutgoing]
  );

  return submitConversationRequest;
}



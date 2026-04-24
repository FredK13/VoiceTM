import { useEffect, useRef, useState } from "react";
import { Audio } from "expo-av";
import { apiFetch } from "../../lib/api";
import { getToken } from "../../lib/session";
import {
  isWsOpen,
  sendJson,
} from "../../lib/realtime";
import type { ChatOverlayMessage } from "../components/ChatOverlay";


type WsReceipt = {
  type: "receipt";
  convoId: string;
  messageId: string;
  status: "read" | "listened";
};


type Args = {
  activeConversationId: string | null;
  myUserId: string | null;
  getWs: () => WebSocket | null;
  setChatMessages: React.Dispatch<React.SetStateAction<ChatOverlayMessage[]>>;
};


export function useChatAudio({
  activeConversationId,
  myUserId,
  getWs,
  setChatMessages,
}: Args) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const playRequestIdRef = useRef(0);
  const playLockRef = useRef(false);


  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    }).catch((err) => console.warn("Failed to set audio mode:", err));
  }, []);


  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
        soundRef.current = null;
      }
    };
  }, []);


  async function stopCurrentAudio() {
    const current = soundRef.current;
    soundRef.current = null;
    setPlayingMessageId(null);


    if (!current) return;


    try {
      await current.stopAsync();
    } catch {}
    try {
      await current.unloadAsync();
    } catch {}
  }


  async function playMessageAudio(
    message: ChatOverlayMessage,
    conversationId?: string,
    auto = false
  ) {
    if (!message.audioUrl) return;


    if (playingMessageId === message.id) {
      await stopCurrentAudio();
      return;
    }


    if (playLockRef.current) return;
    playLockRef.current = true;


    const requestId = ++playRequestIdRef.current;


    try {
      await stopCurrentAudio();


      const token = await getToken();


      const { sound } = await Audio.Sound.createAsync(
        {
          uri: message.audioUrl,
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        },
        { shouldPlay: true }
      );


      if (requestId !== playRequestIdRef.current) {
        try {
          await sound.stopAsync();
        } catch {}
        try {
          await sound.unloadAsync();
        } catch {}
        return;
      }


      soundRef.current = sound;
      setPlayingMessageId(message.id);


      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;


        if (status.didJustFinish) {
          if (requestId !== playRequestIdRef.current) return;


          setPlayingMessageId(null);
          soundRef.current = null;


          if (activeConversationId && myUserId && !message.isMine) {
            const convoId = activeConversationId;
            const nowIso = new Date().toISOString();


            if (!message.listenedAt) {
              apiFetch(`/api/conversations/${convoId}/messages/${message.id}/listened`, {
                method: "POST",
              }).catch(() => {});
            }


            setChatMessages((prev) =>
              prev.map((m) =>
                m.id === message.id
                  ? {
                      ...m,
                      readAt: m.readAt ?? nowIso,
                      listenedAt: m.listenedAt ?? nowIso,
                    }
                  : m
              )
            );


            const ws = getWs();
            if (ws && isWsOpen(ws)) {
              sendJson(ws, {
                type: "receipt",
                convoId,
                messageId: message.id,
                status: "listened",
              } satisfies WsReceipt);
            }
          }
        }
      });


      if (auto && !message.listenedAt && conversationId && !message.isMine) {
        try {
          const nowIso = new Date().toISOString();

          await apiFetch(`/api/conversations/${conversationId}/messages/${message.id}/listened`, {
            method: "POST",
          });


          setChatMessages((prev) =>
            prev.map((m) =>
              m.id === message.id
                ? {
                    ...m,
                    readAt: m.readAt ?? nowIso,
                    listenedAt: m.listenedAt ?? nowIso, 
                  } 
                : m
            )
          );

          const ws = getWs();
          if (ws && isWsOpen(ws) && myUserId) {
            sendJson(ws, {
              type: "receipt",
              convoId: conversationId,
              messageId: message.id,
              status: "listened",
            } satisfies WsReceipt);
            }
        } catch (err) {
          console.warn("Failed to mark message listened:", err);
        }
      }
    } catch (err) {
      console.warn("Failed to play audio:", err);
      await stopCurrentAudio();
    } finally {
      playLockRef.current = false;
    }
  }


  return {
    playingMessageId,
    stopCurrentAudio,
    playMessageAudio,
  };
}


export default useChatAudio;
// src/voice/synthesizeMessageAudio.ts
import { encryptAudio } from "../utils/audioCrypto";
import { uploadObjectToR2 } from "../r2Client";
import { mapEmojisForTts } from "../utils/emojiTtsMapper";


async function callElevenTts(params: {
  voiceId: string;
  apiKey: string;
  text: string;
}) {
  const { voiceId, apiKey, text } = params;


  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_turbo_v2",
    }),
  });


  return res;
}


export async function synthesizeMessageAudio(params: {
  text: string;
  senderId?: string;
  conversationId?: string;
  messageId?: string;


  // per-user voice id (User.elevenLabsVoiceId)
  voiceIdOverride?: string | null;


  // per-user emoji phrases (EmojiProfile.mapping)
  emojiMappingOverride?: Record<string, string> | null;
}): Promise<{ audioUrl: string | null; audioDurationMs: number | null }> {
  const {
    text,
    senderId,
    conversationId,
    messageId,
    voiceIdOverride,
    emojiMappingOverride,
  } = params;


  const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
  const DEFAULT_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;


  const primaryVoiceId = voiceIdOverride ?? DEFAULT_VOICE_ID ?? null;


  if (!ELEVENLABS_API_KEY || !primaryVoiceId) {
    console.warn("ElevenLabs not fully configured - skipping audio generation.");
    return { audioUrl: null, audioDurationMs: null };
  }


  const ttsText = mapEmojisForTts(text, emojiMappingOverride ?? undefined);
  if (!ttsText) {
    console.warn("TTS text empty after emoji mapping; skipping audio.");
    return { audioUrl: null, audioDurationMs: null };
  }


  try {
    // 1) try user voice (or default)
    let res = await callElevenTts({
      voiceId: primaryVoiceId,
      apiKey: ELEVENLABS_API_KEY,
      text: ttsText,
    });


    // 2) if voice was deleted, retry with DEFAULT
    if (res.status === 404 && DEFAULT_VOICE_ID && primaryVoiceId !== DEFAULT_VOICE_ID) {
      console.warn("VoiceId not found (deleted). Retrying with default voice.");
      res = await callElevenTts({
        voiceId: DEFAULT_VOICE_ID,
        apiKey: ELEVENLABS_API_KEY,
        text: ttsText,
      });
    }


    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("ElevenLabs TTS failed:", res.status, errText);
      return { audioUrl: null, audioDurationMs: null };
    }


    const arrayBuf = await res.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuf);


    const encrypted = encryptAudio(audioBuffer);


    const objectKey =
      conversationId && messageId
        ? `messages/${conversationId}/${messageId}.enc`
        : `messages/${senderId ?? "unknown"}/${Date.now()}.enc`;


    await uploadObjectToR2({
      key: objectKey,
      body: encrypted,
      contentType: "application/octet-stream",
    });


    // rough duration estimate (optional)
    let audioDurationMs: number | null = null;
    const contentLengthHeader = res.headers.get("content-length");
    if (contentLengthHeader) {
      const bytes = Number(contentLengthHeader);
      if (!Number.isNaN(bytes) && bytes > 0) {
        const approxSeconds = bytes / 4000;
        audioDurationMs = Math.round(approxSeconds * 1000);
      }
    }


    return { audioUrl: objectKey, audioDurationMs };
  } catch (err) {
    console.error("synthesizeMessageAudio error:", err);
    return { audioUrl: null, audioDurationMs: null };
  }
}

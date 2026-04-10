// src/utils/emojiTtsMapper.ts

/**
 * Map emojis -> phrases that ElevenLabs will actually see.
 * Backend source of truth for TTS replacement.
 */
const EMOJI_TTS_MAP: Record<string, string> = {
  "😂": "hahaha",
  "🤣": "HAHAHAHA",
  "😊": "nothing wrong here",
  "😅": "hah",
  "😍": "you're beautiful",
  "🥹": "awwwe",
  "😭": "I'm bawling",
  "🔥": "Fire!",
  "💀": "I'm dead",
  "❤️": "love you",
  "💔": "I'm heart broken",
  "👍": "thumbs up",
  "👎": "thumbs down",
  "😎": "just chilling",
  "🤔": "I'm thinking",
  "🤯": "mind is blown!",
  "🥳": "party time",
  "🙏": "Thank god!",
  "🤨": "what?",
  "🙂‍↕️": "yes!",
  "🙂‍↔️": "no!",
  "😤": "I'm pissed now!",
  "🥶": "I'm cold",
  "😱": "OMG",
  "🤬": "beeep",
  "🫨": "earthquake!",
  "🤮": "bluuhh!",
  "💩": "poophead!",
  "😴": "sleepy time",
  "🙄": "annoying",
  "😬": "oops!",
  "🫩": "exhausted",
  "🤤": "get in my belly!",
  "😮‍💨": "feeeew",
  "😵‍💫": "I dont know where I am",
  "🤫": "shhhhh!",
  "🤝": "agreed",
  "👀": "looking",
  "🗣️": "LOUD NOISES!",
  "🖕": "BEEP BEEP!",
};


// Regex that matches most emojis
const EMOJI_REGEX =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;


export function mapEmojisForTts(
  original: string,
  mappingOverride?: Record<string, string>
): string {
  if (typeof original !== "string") return "";


  const mapping = { ...EMOJI_TTS_MAP, ...(mappingOverride ?? {}) };
  let output = original;


  for (const [emoji, phrase] of Object.entries(mapping)) {
    if (!emoji || typeof phrase !== "string" || !phrase.trim()) continue;
    output = output.split(emoji).join(` ${phrase} `);
  }


  output = output.replace(EMOJI_REGEX, "");
  output = output.replace(/\s+/g, " ").trim();


  return output;
}
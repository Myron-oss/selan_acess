export const MESSAGE_REACTION_EMOJIS = [
  "❤️",
  "👍",
  "🥰",
  "🔥",
  "👏",
  "😂",
  "😱",
  "😢",
  "🎉"
] as const;

export type MessageReactionEmoji =
  (typeof MESSAGE_REACTION_EMOJIS)[number];

export const MESSAGE_REACTION_EVENT = "message_reaction";
export const MESSAGE_READS_EVENT = "message_reads";

export function getMessageChannelTopic(channelId: string) {
  return `channel:${channelId}`;
}

export function isMessageReactionEmoji(
  value: unknown
): value is MessageReactionEmoji {
  return (
    typeof value === "string" &&
    MESSAGE_REACTION_EMOJIS.some((emoji) => emoji === value)
  );
}

export function getReplyPreviewText(text: string, fallback = "Вложение") {
  const normalized = text.replace(/\s+/g, " ").trim() || fallback;
  return normalized.length > 50
    ? `${normalized.slice(0, 50).trimEnd()}…`
    : normalized;
}

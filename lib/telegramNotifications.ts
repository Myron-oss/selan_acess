import "server-only";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sendTelegramBotMessage } from "@/lib/telegramBot";
import type { MessageFileType } from "@/lib/types";

const TELEGRAM_BATCH_SIZE = 25;
const TELEGRAM_BATCH_DELAY_MS = 1_000;
const MESSAGE_PREVIEW_LENGTH = 150;

interface NewMessageNotification {
  channelId: string;
  senderTgId: number;
  senderName: string;
  text: string;
  fileType: MessageFileType | null;
  fileName: string | null;
  createdAt: string;
  appOrigin: string;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function truncateText(value: string): string {
  const characters = Array.from(value);
  if (characters.length <= MESSAGE_PREVIEW_LENGTH) {
    return value;
  }

  return `${characters.slice(0, MESSAGE_PREVIEW_LENGTH).join("")}...`;
}

function getMessagePreview(notification: NewMessageNotification): string {
  if (notification.text) {
    return truncateText(notification.text);
  }

  if (notification.fileType === "image") {
    return "[Фото]";
  }
  if (notification.fileType === "video") {
    return "[Видео]";
  }

  return `[Файл: ${notification.fileName || "вложение"}]`;
}

function getNotificationTime(createdAt: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Kyiv"
  }).format(new Date(createdAt));
}

function getChannelUrl(appOrigin: string, channelId: string): string {
  const url = new URL(appOrigin);
  url.searchParams.set("channel", channelId);
  return url.toString();
}

export async function notifyChannelMembers(
  notification: NewMessageNotification
): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error("Message notifications skipped: TELEGRAM_BOT_TOKEN is missing");
    return;
  }

  const supabase = getSupabaseAdmin();
  const { data: channel, error: channelError } = await supabase
    .from("channels")
    .select("id,name,emoji,allowed_role_ids")
    .eq("id", notification.channelId)
    .maybeSingle();

  if (channelError) {
    throw channelError;
  }
  if (!channel) {
    console.error("Message notifications skipped: channel no longer exists", {
      channel_id: notification.channelId
    });
    return;
  }

  const allowedRoleIds = Array.isArray(channel.allowed_role_ids)
    ? channel.allowed_role_ids.map(String)
    : [];
  if (allowedRoleIds.length === 0) {
    return;
  }

  const { data: recipients, error: recipientsError } = await supabase
    .from("employees")
    .select("tg_id")
    .in("role_id", allowedRoleIds)
    .eq("notifications_enabled", true)
    .neq("tg_id", String(notification.senderTgId));

  if (recipientsError) {
    throw recipientsError;
  }

  const recipientIds = (recipients ?? []).map((recipient) =>
    String(recipient.tg_id)
  );
  if (recipientIds.length === 0) {
    return;
  }

  const channelLabel = [channel.emoji, channel.name].filter(Boolean).join(" ");
  const notificationText = [
    `${notification.senderName} прислал новое сообщение:`,
    getMessagePreview(notification),
    "",
    `Ветка: ${channelLabel}`,
    `Время: ${getNotificationTime(notification.createdAt)}`
  ].join("\n");
  const channelUrl = getChannelUrl(notification.appOrigin, notification.channelId);
  let delivered = 0;
  let failed = 0;

  for (let index = 0; index < recipientIds.length; index += TELEGRAM_BATCH_SIZE) {
    const batch = recipientIds.slice(index, index + TELEGRAM_BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((recipientTgId) =>
        sendTelegramBotMessage(
          botToken,
          {
            chatId: recipientTgId,
            text: notificationText,
            replyMarkup: {
              inline_keyboard: [
                [
                  {
                    text: "Открыть чат",
                    web_app: { url: channelUrl }
                  }
                ]
              ]
            }
          }
        )
      )
    );

    results.forEach((result, resultIndex) => {
      if (result.status === "fulfilled") {
        delivered += 1;
        return;
      }

      failed += 1;
      console.warn("Telegram message notification failed", {
        recipient_tg_id: batch[resultIndex],
        error:
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason)
      });
    });

    if (index + TELEGRAM_BATCH_SIZE < recipientIds.length) {
      await delay(TELEGRAM_BATCH_DELAY_MS);
    }
  }

  console.info("Telegram message notifications completed", {
    channel_id: notification.channelId,
    recipients: recipientIds.length,
    delivered,
    failed
  });
}

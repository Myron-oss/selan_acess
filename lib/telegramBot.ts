import "server-only";

interface TelegramApiResponse {
  ok?: boolean;
  description?: string;
  error_code?: number;
}

interface SendTelegramMessageOptions {
  chatId: number | string;
  text: string;
  replyMarkup?: Record<string, unknown>;
}

export async function sendTelegramBotMessage(
  botToken: string,
  { chatId, text, replyMarkup }: SendTelegramMessageOptions
): Promise<void> {
  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {})
      }),
      cache: "no-store"
    }
  );
  const result = (await response.json().catch(() => ({}))) as TelegramApiResponse;

  if (!response.ok || !result.ok) {
    throw new Error(
      `Telegram ${result.error_code ?? response.status}: ${
        result.description ?? response.statusText ?? "unknown error"
      }`
    );
  }
}

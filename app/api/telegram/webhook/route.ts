import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TelegramUpdate {
  message?: {
    text?: string;
    chat?: { id?: number };
    from?: {
      id?: number;
      username?: string;
      first_name?: string;
      last_name?: string;
    };
  };
}

async function sendTelegramMessage(chatId: number, text: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }

  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text
      }),
      cache: "no-store"
    }
  );

  if (!response.ok) {
    throw new Error(`Telegram sendMessage failed with ${response.status}`);
  }
}

function isStartCommand(text: string | undefined): boolean {
  return Boolean(text && /^\/start(?:@[A-Za-z0-9_]+)?(?:\s|$)/i.test(text));
}

function normalizeFullName(text: string | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

export async function POST(request: Request) {
  try {
    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (
      webhookSecret &&
      request.headers.get("x-telegram-bot-api-secret-token") !== webhookSecret
    ) {
      return NextResponse.json(
        { ok: false, error: "Недействительная подпись вебхука." },
        { status: 401 }
      );
    }

    const update = (await request.json()) as TelegramUpdate;
    const message = update.message;

    if (!message) {
      return NextResponse.json({ ok: true });
    }

    const from = message.from;
    const tgId = Number(from?.id);
    const chatId = Number(message.chat?.id ?? from?.id);

    if (
      !Number.isSafeInteger(tgId) ||
      tgId <= 0 ||
      !Number.isSafeInteger(chatId)
    ) {
      return NextResponse.json({ ok: true });
    }

    const supabase = getSupabaseAdmin();
    const { data: employee, error: employeeError } = await supabase
      .from("employees")
      .select("id")
      .eq("tg_id", String(tgId))
      .maybeSingle();

    if (employeeError) {
      throw employeeError;
    }

    if (employee) {
      await sendTelegramMessage(
        chatId,
        "У вас уже есть доступ, откройте приложение через кнопку меню"
      );
      return NextResponse.json({ ok: true });
    }

    const { data: existingRequest, error: requestError } = await supabase
      .from("access_requests")
      .select("id,status")
      .eq("tg_id", String(tgId))
      .maybeSingle();

    if (requestError) {
      throw requestError;
    }

    if (existingRequest?.status === "pending") {
      await sendTelegramMessage(
        chatId,
        "Ваша заявка уже на рассмотрении"
      );
      return NextResponse.json({ ok: true });
    }

    const username = from?.username?.trim().replace(/^@/, "").slice(0, 64);

    if (isStartCommand(message.text)) {
      const { error: sessionError } = await supabase
        .from("bot_registration_sessions")
        .upsert({
          tg_id: String(tgId),
          chat_id: String(chatId),
          tg_username: username || null,
          updated_at: new Date().toISOString()
        });

      if (sessionError) {
        throw sessionError;
      }

      await sendTelegramMessage(
        chatId,
        "Чтобы подать заявку на доступ, отправьте одним сообщением ваши фамилию и имя. Например: Иван Петров"
      );
      return NextResponse.json({ ok: true });
    }

    const { data: registrationSession, error: sessionLoadError } =
      await supabase
        .from("bot_registration_sessions")
        .select("tg_id,tg_username")
        .eq("tg_id", String(tgId))
        .maybeSingle();

    if (sessionLoadError) {
      throw sessionLoadError;
    }

    if (!registrationSession) {
      await sendTelegramMessage(
        chatId,
        existingRequest
          ? "Ваша заявка уже обработана. Чтобы подать новую заявку, отправьте /start"
          : "Чтобы подать заявку на доступ, отправьте команду /start"
      );
      return NextResponse.json({ ok: true });
    }

    const fullName = normalizeFullName(message.text);
    if (
      fullName.length < 3 ||
      fullName.length > 150 ||
      fullName.split(" ").length < 2 ||
      fullName.startsWith("/")
    ) {
      await sendTelegramMessage(
        chatId,
        "Введите фамилию и имя полностью, двумя словами. Например: Иван Петров"
      );
      return NextResponse.json({ ok: true });
    }

    const requestPayload = {
      tg_username:
        username ||
        (registrationSession.tg_username as string | null) ||
        null,
      full_name: fullName,
      status: "pending",
      created_at: new Date().toISOString()
    };

    const { error: saveRequestError } = existingRequest
      ? await supabase
          .from("access_requests")
          .update(requestPayload)
          .eq("id", existingRequest.id)
      : await supabase.from("access_requests").insert({
        tg_id: String(tgId),
        ...requestPayload
      });

    if (saveRequestError) {
      if (saveRequestError.code === "23505") {
        await sendTelegramMessage(
          chatId,
          "Ваша заявка уже на рассмотрении"
        );
        return NextResponse.json({ ok: true });
      }
      throw saveRequestError;
    }

    const { error: cleanupError } = await supabase
      .from("bot_registration_sessions")
      .delete()
      .eq("tg_id", String(tgId));

    if (cleanupError) {
      throw cleanupError;
    }

    await sendTelegramMessage(
      chatId,
      "Заявка отправлена, ожидайте подтверждения администратора"
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to process Telegram webhook", error);
    return NextResponse.json(
      { ok: false, error: "Не удалось обработать обновление Telegram." },
      { status: 500 }
    );
  }
}

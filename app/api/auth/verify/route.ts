import { NextRequest, NextResponse } from "next/server";

import { getCachedChannelsForRole } from "@/lib/cachedReferenceData";
import { getEmployeeContext } from "@/lib/supabaseAdmin";
import {
  createSessionToken,
  SESSION_COOKIE_MAX_AGE,
  SESSION_COOKIE_NAME,
  verifyTelegramInitData
} from "@/lib/telegramAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { initData?: unknown };
    const initData = typeof body.initData === "string" ? body.initData : "";
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const sessionSecret = process.env.SESSION_SECRET;

    if (!botToken || !sessionSecret) {
      console.error("Telegram or session environment variables are missing");
      return NextResponse.json(
        { error: "Сервис авторизации не настроен." },
        { status: 500 }
      );
    }

    const verification = verifyTelegramInitData(initData, botToken);
    if (!verification.valid || !verification.userId) {
      return NextResponse.json(
        { error: "Недействительные данные Telegram." },
        { status: 401 }
      );
    }

    const employee = await getEmployeeContext(verification.userId);
    if (!employee) {
      return NextResponse.json(
        { error: "Доступ не предоставлен" },
        { status: 403 }
      );
    }

    const channels = await getCachedChannelsForRole(employee.role_id);
    const sessionToken = createSessionToken(employee.tg_id, sessionSecret);
    const response = NextResponse.json({
      employee: {
        tg_id: employee.tg_id,
        full_name: employee.full_name,
        role: employee.role,
        avatar_url: employee.avatar_url,
        theme_preference: employee.theme_preference,
        accent_color: employee.accent_color,
        notifications_enabled: employee.notifications_enabled
      },
      is_admin: employee.role.is_admin,
      channels
    });

    // initData проверяется один раз здесь. Все следующие защищённые запросы
    // используют подписанную httpOnly cookie; tg_id из тела/URL не принимается.
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: sessionToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_COOKIE_MAX_AGE
    });

    return response;
  } catch (error) {
    console.error("Telegram auth verification failed", error);
    return NextResponse.json(
      { error: "Не удалось проверить доступ." },
      { status: 500 }
    );
  }
}

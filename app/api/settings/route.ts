import { NextRequest, NextResponse } from "next/server";

import {
  isAccentColor,
  isThemePreference
} from "@/lib/preferences";
import { requireEmployee } from "@/lib/apiAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const authorization = await requireEmployee(request);
    if ("response" in authorization) {
      return authorization.response;
    }
    const { employee } = authorization;

    return NextResponse.json({
      settings: {
        theme_preference: employee.theme_preference,
        accent_color: employee.accent_color,
        avatar_url: employee.avatar_url
      }
    });
  } catch (error) {
    console.error("Failed to load settings", error);
    return NextResponse.json(
      { error: "Не удалось загрузить настройки." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authorization = await requireEmployee(request);
    if ("response" in authorization) {
      return authorization.response;
    }
    const { employee } = authorization;

    const body = (await request.json()) as {
      theme_preference?: unknown;
      accent_color?: unknown;
      avatar_url?: unknown;
    };
    const updates: Record<string, string | null> = {};

    if (body.theme_preference !== undefined) {
      if (!isThemePreference(body.theme_preference)) {
        return NextResponse.json(
          { error: "Неизвестный режим темы." },
          { status: 400 }
        );
      }
      updates.theme_preference = body.theme_preference;
    }

    if (body.accent_color !== undefined) {
      if (!isAccentColor(body.accent_color)) {
        return NextResponse.json(
          { error: "Неизвестный акцентный цвет." },
          { status: 400 }
        );
      }
      updates.accent_color = body.accent_color;
    }

    if (body.avatar_url !== undefined) {
      if (body.avatar_url === null) {
        updates.avatar_url = null;
      } else if (typeof body.avatar_url === "string") {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const allowedPrefix = `${supabaseUrl}/storage/v1/object/public/avatars/${employee.tg_id}/`;

        if (!supabaseUrl || !body.avatar_url.startsWith(allowedPrefix)) {
          return NextResponse.json(
            { error: "Некорректный URL аватарки." },
            { status: 400 }
          );
        }
        updates.avatar_url = body.avatar_url;
      } else {
        return NextResponse.json(
          { error: "Некорректный URL аватарки." },
          { status: 400 }
        );
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "Нет настроек для изменения." },
        { status: 400 }
      );
    }

    const { data, error } = await getSupabaseAdmin()
      .from("employees")
      .update(updates)
      .eq("id", employee.id)
      .select("theme_preference,accent_color,avatar_url")
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      settings: {
        theme_preference: data.theme_preference,
        accent_color: data.accent_color,
        avatar_url: (data.avatar_url as string | null) ?? null
      }
    });
  } catch (error) {
    console.error("Failed to update settings", error);
    return NextResponse.json(
      { error: "Не удалось сохранить настройки." },
      { status: 500 }
    );
  }
}

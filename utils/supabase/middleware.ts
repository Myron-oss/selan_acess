import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { readSupabasePublicConfig } from "@/utils/supabase/config";

export async function updateSession(request: NextRequest) {
  const config = readSupabasePublicConfig();
  let supabaseResponse = NextResponse.next({ request });

  if (!config) {
    return supabaseResponse;
  }

  // Форум использует собственную Telegram-cookie. Не обращаемся к Supabase
  // Auth на каждом запросе, если в браузере нет отдельной Supabase-сессии.
  const hasSupabaseAuthCookie = request.cookies
    .getAll()
    .some(
      ({ name }) => name.startsWith("sb-") && name.includes("auth-token")
    );

  if (!hasSupabaseAuthCookie) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    config.supabaseUrl,
    config.supabaseKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        }
      }
    }
  );

  await supabase.auth.getUser();
  return supabaseResponse;
}

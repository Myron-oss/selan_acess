import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabasePublicConfig } from "@/utils/supabase/config";

export function createClient(
  cookieStore: Awaited<ReturnType<typeof cookies>>
) {
  const { supabaseUrl, supabaseKey } = getSupabasePublicConfig();

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Server Components не могут записывать cookie. Middleware обновит
          // Supabase Auth-сессию, если такая сессия используется.
        }
      }
    }
  });
}

import { createBrowserClient } from "@supabase/ssr";

import { getSupabasePublicConfig } from "@/utils/supabase/config";
import { fetchWithNoStore } from "@/utils/supabase/fetch";

export function createClient() {
  const { supabaseUrl, supabaseKey } = getSupabasePublicConfig();
  return createBrowserClient(supabaseUrl, supabaseKey, {
    global: {
      fetch: fetchWithNoStore
    }
  });
}

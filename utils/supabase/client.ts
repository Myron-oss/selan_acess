import { createBrowserClient } from "@supabase/ssr";

import { getSupabasePublicConfig } from "@/utils/supabase/config";

export function createClient() {
  const { supabaseUrl, supabaseKey } = getSupabasePublicConfig();
  return createBrowserClient(supabaseUrl, supabaseKey);
}

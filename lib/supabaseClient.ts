"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/utils/supabase/client";

let browserClient: SupabaseClient | undefined;

export function getSupabaseClient(): SupabaseClient {
  if (browserClient) {
    return browserClient;
  }

  browserClient = createClient();

  return browserClient;
}

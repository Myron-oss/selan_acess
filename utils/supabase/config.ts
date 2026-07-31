interface SupabasePublicConfig {
  supabaseUrl: string;
  supabaseKey: string;
}

export function readSupabasePublicConfig(): SupabasePublicConfig | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  return supabaseUrl && supabaseKey ? { supabaseUrl, supabaseKey } : null;
}

export function getSupabasePublicConfig(): SupabasePublicConfig {
  const config = readSupabasePublicConfig();
  if (!config) {
    throw new Error("Публичные настройки Supabase не заданы");
  }

  return config;
}

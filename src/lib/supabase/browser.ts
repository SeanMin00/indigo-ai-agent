import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env/client";

export function createSupabaseBrowserClient() {
  return createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
}

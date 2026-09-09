import { createInkwellClient, type InkwellSupabaseClient } from "@inkwell/api-client";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isLocalOnlyMode } from "./env";

let client: InkwellSupabaseClient | null = null;

/** Returns null in local-only mode (no Supabase project configured). */
export function getSupabase(): InkwellSupabaseClient | null {
  if (isLocalOnlyMode) return null;
  if (!client) {
    client = createInkwellClient({
      url: SUPABASE_URL!,
      anonKey: SUPABASE_ANON_KEY!,
      storage: window.localStorage,
    });
  }
  return client;
}

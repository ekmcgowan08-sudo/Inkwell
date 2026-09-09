import * as SecureStore from "expo-secure-store";
import { createInkwellClient, type InkwellSupabaseClient } from "@inkwell/api-client";
import type { SupportedStorage } from "@supabase/supabase-js";

/**
 * Refresh tokens go in the OS keychain (expo-secure-store), NOT
 * AsyncStorage in the clear — this is the platform-appropriate secure
 * token storage the brief calls for on mobile. See docs/SECURITY.md.
 */
const secureStorageAdapter: SupportedStorage = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isMobileBackendConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let client: InkwellSupabaseClient | null = null;

/**
 * Unlike apps/web, mobile has no local-only fallback in this pass (no
 * on-device SQLite-backed local-first store has been built yet for
 * Expo — see docs/IMPLEMENTATION_STATUS.md). A Supabase project is
 * required for the mobile app to do anything beyond render its shell.
 */
export function getSupabase(): InkwellSupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      "EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY are not set. Copy .env.example to .env and fill them in.",
    );
  }
  if (!client) {
    client = createInkwellClient({
      url: SUPABASE_URL,
      anonKey: SUPABASE_ANON_KEY,
      storage: secureStorageAdapter,
      autoRefreshToken: true,
    });
  }
  return client;
}

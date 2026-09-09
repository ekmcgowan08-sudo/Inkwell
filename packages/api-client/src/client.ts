import { createClient, type SupabaseClient, type SupportedStorage } from "@supabase/supabase-js";
import type { Database } from "./database.types.ts";

export interface CreateInkwellClientOptions {
  url: string;
  anonKey: string;
  /**
   * Platform-specific session storage. Web/desktop (Tauri webview) should pass
   * `window.localStorage`. Mobile should pass an Expo SecureStore-backed
   * adapter so the refresh token sits in the OS keychain, not AsyncStorage in
   * the clear. Never share this storage across platforms.
   */
  storage: SupportedStorage;
  /** Required on native (Expo) where there's no page focus to auto-refresh on; pass `AppState` there. */
  autoRefreshToken?: boolean;
}

export type InkwellSupabaseClient = SupabaseClient<Database>;

export function createInkwellClient(options: CreateInkwellClientOptions): InkwellSupabaseClient {
  return createClient<Database>(options.url, options.anonKey, {
    auth: {
      storage: options.storage,
      persistSession: true,
      autoRefreshToken: options.autoRefreshToken ?? true,
      detectSessionInUrl: typeof window !== "undefined",
      flowType: "pkce",
    },
  });
}

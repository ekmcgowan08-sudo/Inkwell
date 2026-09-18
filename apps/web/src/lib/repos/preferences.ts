import { getSupabase } from "../supabase";
import { isLocalOnlyMode } from "../env";

/**
 * Cross-device sync for the `preferences` table (theme, reduced motion). The table has existed
 * since early in the project (RLS-protected, one row per user) but was never wired up — every
 * client wrote theme/reduced-motion to `localStorage` only, which is correct for local-only mode
 * (no account to sync to) but meant a signed-in cloud author's dark-mode choice never followed
 * them to a second device. `localStorage` stays the source of truth for instant paint on load (no
 * flash of default theme while an async fetch resolves); this is the best-effort sync layer on
 * top of it for cloud accounts.
 */
export interface RemotePreferences {
  theme: "dark" | "light" | "system";
  reducedMotion: boolean;
}

export async function loadRemotePreferences(): Promise<RemotePreferences | null> {
  if (isLocalOnlyMode) return null;
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return null;

  const { data } = (await supabase.from("preferences").select("theme, reduced_motion").eq("user_id", userId).maybeSingle()) as {
    data: { theme: string; reduced_motion: boolean } | null;
  };
  if (!data) return null;
  return { theme: data.theme as RemotePreferences["theme"], reducedMotion: data.reduced_motion };
}

export async function saveRemotePreferences(prefs: RemotePreferences): Promise<void> {
  if (isLocalOnlyMode) return;
  const supabase = getSupabase();
  if (!supabase) return;
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return;

  await supabase.from("preferences").upsert({ user_id: userId, theme: prefs.theme, reduced_motion: prefs.reducedMotion } as never);
}

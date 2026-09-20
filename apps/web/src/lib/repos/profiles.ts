import { getSupabase } from "../supabase";
import { isLocalOnlyMode } from "../env";

/**
 * Terms/Privacy acceptance only applies to real cloud accounts — local-only mode never creates a
 * `profiles` row (no account, nothing leaves the browser), so it's treated as always-accepted.
 * In-memory only: a fresh check per session is cheap and correct; nothing here needs to survive
 * a reload, since a reload just re-derives it from the same `profiles` row.
 */
const acceptanceCache = new Map<string, boolean>();

export async function hasAcceptedLegalTerms(userId: string): Promise<boolean> {
  if (isLocalOnlyMode) return true;
  const cached = acceptanceCache.get(userId);
  if (cached !== undefined) return cached;

  const supabase = getSupabase();
  if (!supabase) return true;
  const { data } = (await supabase.from("profiles").select("terms_accepted_at, privacy_accepted_at").eq("id", userId).maybeSingle()) as {
    data: { terms_accepted_at: string | null; privacy_accepted_at: string | null } | null;
  };
  const accepted = !!data?.terms_accepted_at && !!data?.privacy_accepted_at;
  acceptanceCache.set(userId, accepted);
  return accepted;
}

export async function acceptLegalTerms(userId: string): Promise<void> {
  if (isLocalOnlyMode) return;
  const supabase = getSupabase();
  if (!supabase) return;
  const now = new Date().toISOString();
  await supabase
    .from("profiles")
    .update({ terms_accepted_at: now, privacy_accepted_at: now } as never)
    .eq("id", userId);
  acceptanceCache.set(userId, true);
}

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Sliding-window rate limit on top of the monthly token allowance: caps how many AI Assistant
 * requests one user can make in a rolling window, independent of whether they're still under
 * budget for the month. Backed by a small Postgres table (`ai_rate_limit_events`,
 * `supabase/migrations/0012_ai_rate_limiting.sql`) rather than an external store (Redis/Upstash)
 * — this sandbox and most self-hosted Supabase deployments don't have one, and request volume
 * for an AI assistant endpoint is low enough for Postgres to be a fine backing store. See
 * docs/AI_ARCHITECTURE.md.
 *
 * Known limitation, stated plainly: the count-then-insert here is two round trips, not one atomic
 * statement, so truly simultaneous requests from the same user (e.g. multiple browser tabs firing
 * at once) could both pass the check before either commits. This is an abuse throttle, not the
 * financial backstop (the monthly token allowance, checked separately against already-committed
 * usage rows, is that) — a few extra requests slipping through a race isn't a budget breach.
 */
export const RATE_LIMIT_WINDOW_SECONDS = 60;
export const RATE_LIMIT_MAX_REQUESTS = 8;

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export async function checkAndRecordRateLimit(
  serviceClient: SupabaseClient,
  userId: string,
  windowSeconds = RATE_LIMIT_WINDOW_SECONDS,
  maxRequests = RATE_LIMIT_MAX_REQUESTS,
): Promise<RateLimitResult> {
  const windowStart = new Date(Date.now() - windowSeconds * 1000).toISOString();

  // Opportunistic cleanup: delete this user's events older than the window so the table never
  // grows unbounded, without needing a separate scheduled job/cron.
  await serviceClient.from("ai_rate_limit_events").delete().eq("user_id", userId).lt("created_at", windowStart);

  const { count, error: countError } = await serviceClient
    .from("ai_rate_limit_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", windowStart);
  if (countError) throw new Error(`Rate limit check failed: ${countError.message}`);

  if ((count ?? 0) >= maxRequests) {
    return { allowed: false, retryAfterSeconds: windowSeconds };
  }

  const { error: insertError } = await serviceClient.from("ai_rate_limit_events").insert({ user_id: userId });
  if (insertError) throw new Error(`Rate limit record failed: ${insertError.message}`);

  return { allowed: true, retryAfterSeconds: 0 };
}

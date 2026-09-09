import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

/**
 * A client that acts AS THE CALLER, using their own JWT — every query
 * through this client is subject to the same Postgres RLS policies the web
 * app itself would hit. Used for every READ in this function, so "can this
 * user see this project/chapter/story-bible entry" is enforced by the
 * database, not by this function remembering to check.
 */
export function createUserClient(authHeader: string): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Bypasses RLS entirely. Used ONLY for the specific server-only writes this
 * function is responsible for (ai_messages, ai_findings, ai_usage) — every
 * call site using this client must independently verify the target row
 * belongs to the caller before writing, since RLS won't stop it. See the
 * ownership checks in index.ts.
 */
export function createServiceClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

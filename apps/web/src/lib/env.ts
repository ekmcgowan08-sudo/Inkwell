export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * True when no Supabase project is configured. The app still runs fully in
 * this mode — single implicit local user, IndexedDB-only persistence, no
 * cross-device sync, AI assistant uses the deterministic test provider
 * in-browser (never a real Anthropic call) — so a fresh clone with an empty
 * `.env` is still a real, usable app rather than a dead end. See
 * docs/DEPLOYMENT.md.
 */
export const isLocalOnlyMode = !SUPABASE_URL || !SUPABASE_ANON_KEY;

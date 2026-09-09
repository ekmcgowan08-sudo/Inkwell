import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";
import { getOrCreateLocalUser } from "./db";
import { isLocalOnlyMode } from "./env";

interface AuthContextValue {
  userId: string | null;
  email: string | null;
  loading: boolean;
  isLocalOnly: boolean;
  signUp: (email: string, password: string) => Promise<{ error: string | null; needsEmailVerification: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [localUserId, setLocalUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isLocalOnlyMode) {
      getOrCreateLocalUser().then((u) => {
        setLocalUserId(u.id);
        setLoading(false);
      });
      return;
    }
    const supabase = getSupabase()!;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      userId: isLocalOnlyMode ? localUserId : (session?.user.id ?? null),
      email: isLocalOnlyMode ? null : (session?.user.email ?? null),
      loading,
      isLocalOnly: isLocalOnlyMode,
      async signUp(email, password) {
        if (isLocalOnlyMode) return { error: "Not available in local-only mode.", needsEmailVerification: false };
        const { data, error } = await getSupabase()!.auth.signUp({ email, password });
        return { error: error?.message ?? null, needsEmailVerification: !data.session };
      },
      async signIn(email, password) {
        if (isLocalOnlyMode) return { error: "Not available in local-only mode." };
        const { error } = await getSupabase()!.auth.signInWithPassword({ email, password });
        return { error: error?.message ?? null };
      },
      async signOut() {
        if (isLocalOnlyMode) return;
        await getSupabase()!.auth.signOut();
      },
      async requestPasswordReset(email) {
        if (isLocalOnlyMode) return { error: "Not available in local-only mode." };
        const { error } = await getSupabase()!.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        return { error: error?.message ?? null };
      },
      async updatePassword(newPassword) {
        if (isLocalOnlyMode) return { error: "Not available in local-only mode." };
        const { error } = await getSupabase()!.auth.updateUser({ password: newPassword });
        return { error: error?.message ?? null };
      },
    }),
    [session, localUserId, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

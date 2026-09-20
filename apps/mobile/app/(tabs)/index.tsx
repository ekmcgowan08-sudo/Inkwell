import { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, Pressable, StyleSheet, RefreshControl, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { darkTheme } from "@inkwell/design-tokens";
import { toCamelRow, type Project } from "@inkwell/shared-types";
import { useAuth } from "../../lib/auth";
import { getSupabase } from "../../lib/supabase";

export default function LibraryScreen() {
  const { userId, loading: authLoading } = useAuth();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setError(null);
    const { data, error } = await getSupabase()
      .from("projects")
      .select("*")
      .eq("status", "active")
      .order("last_edited_at", { ascending: false });
    if (error) setError(error.message);
    else setProjects((data ?? []).map((row) => toCamelRow<Project>(row)));
    setLoading(false);
    setRefreshing(false);
  }, [userId]);

  useEffect(() => {
    if (!authLoading && !userId) router.replace("/login");
  }, [authLoading, userId, router]);

  // Fetches on mount/userId change — setState only happens after the await resolves, not
  // synchronously in the effect body, so this is the standard React-docs "fetch on mount" pattern.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (authLoading || loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={darkTheme.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.page} edges={["top"]}>
      <Text style={styles.title}>Your Books</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      <FlatList
        data={projects}
        keyExtractor={(p) => p.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={darkTheme.accent} />}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No books yet</Text>
            <Text style={styles.emptyBody}>Create your first book on desktop or web — mobile project creation is on the roadmap.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => router.push(`/book/${item.id}/manuscript`)} accessibilityRole="button">
            <Text style={styles.cardGenre}>{item.genre || "Untitled genre"}</Text>
            <Text style={styles.cardTitle}>{item.title}</Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: darkTheme.bg },
  center: { flex: 1, backgroundColor: darkTheme.bg, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 24, fontWeight: "700", color: darkTheme.textPrimary, paddingHorizontal: 16, paddingTop: 12 },
  error: { color: darkTheme.danger, paddingHorizontal: 16 },
  card: { backgroundColor: darkTheme.bgElevated, borderRadius: 12, padding: 16, minHeight: 64, borderWidth: 1, borderColor: darkTheme.border },
  cardGenre: { color: darkTheme.accent, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  cardTitle: { color: darkTheme.textPrimary, fontSize: 17, fontWeight: "600" },
  empty: { padding: 32, alignItems: "center", gap: 8 },
  emptyTitle: { color: darkTheme.textPrimary, fontSize: 17, fontWeight: "600" },
  emptyBody: { color: darkTheme.textSecondary, fontSize: 13, textAlign: "center" },
});

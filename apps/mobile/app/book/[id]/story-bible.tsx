import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TextInput, FlatList, Pressable, StyleSheet, ActivityIndicator, RefreshControl, KeyboardAvoidingView, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { darkTheme } from "@inkwell/design-tokens";
import { toCamelRow, type StoryBibleEntry } from "@inkwell/shared-types";
import { getSupabase } from "../../../lib/supabase";

const AUTOSAVE_IDLE_MS = 1500;
const ENTRY_TYPE_LABEL: Record<StoryBibleEntry["entryType"], string> = {
  character: "Character",
  location: "Location",
  lore: "Lore",
  object: "Object",
  organization: "Organization",
  custom: "Custom",
};

/**
 * A deliberately simple mobile story bible for v0: a flat list (no per-type tabs, no
 * relationships/appearances/tags UI) with inline name+summary editing — same scope philosophy as
 * manuscript.tsx's plain-text-only editor. Real, working, honestly narrow. See
 * docs/IMPLEMENTATION_STATUS.md.
 */
export default function StoryBibleScreen() {
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [entries, setEntries] = useState<StoryBibleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "saving">("saved");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setError(null);
    const { data, error } = await getSupabase()
      .from("story_bible_entries")
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("name");
    if (error) setError(error.message);
    else setEntries((data ?? []).map((row) => toCamelRow<StoryBibleEntry>(row)));
    setLoading(false);
    setRefreshing(false);
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const selected = entries.find((e) => e.id === selectedId) ?? null;

  useEffect(() => {
    setName(selected?.name ?? "");
    setSummary(selected?.summary ?? "");
  }, [selected?.id]);

  function scheduleSave(nextName: string, nextSummary: string) {
    if (!selected) return;
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      // `as never`: the placeholder Database type (not yet generated from a real project) types
      // every table generically, which confuses supabase-js's .update() overload resolution —
      // same cast used in book/[id]/manuscript.tsx and apps/web/src/lib/sync.ts, for the same
      // reason. Runtime behavior against PostgREST is unaffected either way.
      await getSupabase()
        .from("story_bible_entries")
        .update({ name: nextName || "Untitled", summary: nextSummary, revision: selected.revision + 1 } as never)
        .eq("id", selected.id);
      setEntries((prev) => prev.map((e) => (e.id === selected.id ? { ...e, name: nextName || "Untitled", summary: nextSummary } : e)));
      setSaveState("saved");
    }, AUTOSAVE_IDLE_MS);
  }

  async function addCharacter() {
    const { data, error } = await getSupabase()
      .from("story_bible_entries")
      .insert({ project_id: projectId, entry_type: "character", name: "New Character" } as never)
      .select("*")
      .single();
    if (error || !data) {
      setError(error?.message ?? "Couldn't create entry.");
      return;
    }
    const entry = toCamelRow<StoryBibleEntry>(data);
    setEntries((prev) => [...prev, entry].sort((a, b) => a.name.localeCompare(b.name)));
    setSelectedId(entry.id);
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={darkTheme.accent} />
      </SafeAreaView>
    );
  }

  if (selected) {
    return (
      <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.detailHeader}>
          <Pressable onPress={() => setSelectedId(null)} accessibilityRole="button">
            <Text style={styles.backLink}>‹ All entries</Text>
          </Pressable>
          <Text style={styles.statusText}>{saveState === "saving" ? "Saving…" : "Saved"}</Text>
        </View>
        <Text style={styles.entryTypeBadge}>{ENTRY_TYPE_LABEL[selected.entryType]}</Text>
        <TextInput
          style={styles.nameInput}
          value={name}
          onChangeText={(t) => {
            setName(t);
            scheduleSave(t, summary);
          }}
          placeholder="Name"
          placeholderTextColor={darkTheme.textSecondary}
          accessibilityLabel="Entry name"
        />
        <SafeAreaView style={styles.summaryWrap} edges={["bottom"]}>
          <TextInput
            style={styles.summaryInput}
            multiline
            value={summary}
            onChangeText={(t) => {
              setSummary(t);
              scheduleSave(name, t);
            }}
            placeholder="Summary…"
            placeholderTextColor={darkTheme.textSecondary}
            textAlignVertical="top"
            accessibilityLabel="Entry summary"
          />
        </SafeAreaView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <SafeAreaView style={styles.page} edges={["bottom"]}>
      <View style={styles.navRow}>
        <Pressable onPress={() => router.replace(`/book/${projectId}/manuscript`)} accessibilityRole="button">
          <Text style={styles.navLink}>Manuscript</Text>
        </Pressable>
        <Text style={[styles.navLink, styles.navLinkActive]}>Story Bible</Text>
        <Pressable onPress={() => router.replace(`/book/${projectId}/timeline`)} accessibilityRole="button">
          <Text style={styles.navLink}>Timeline</Text>
        </Pressable>
        <Pressable onPress={() => router.replace(`/book/${projectId}/ai-assistant`)} accessibilityRole="button">
          <Text style={styles.navLink}>AI Assistant</Text>
        </Pressable>
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      <FlatList
        data={entries}
        keyExtractor={(e) => e.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={darkTheme.accent} />}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No story bible entries yet</Text>
            <Text style={styles.emptyBody}>Add your first character below.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => setSelectedId(item.id)} accessibilityRole="button">
            <Text style={styles.cardType}>{ENTRY_TYPE_LABEL[item.entryType]}</Text>
            <Text style={styles.cardTitle}>{item.name}</Text>
            {item.summary ? (
              <Text style={styles.cardSummary} numberOfLines={2}>
                {item.summary}
              </Text>
            ) : null}
          </Pressable>
        )}
      />
      <Pressable style={styles.addButton} onPress={addCharacter} accessibilityRole="button">
        <Text style={styles.addButtonText}>+ New Character</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: darkTheme.bg },
  center: { flex: 1, backgroundColor: darkTheme.bg, alignItems: "center", justifyContent: "center" },
  error: { color: darkTheme.danger, paddingHorizontal: 16, paddingTop: 12 },
  card: { backgroundColor: darkTheme.bgElevated, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: darkTheme.border },
  cardType: { color: darkTheme.accent, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  cardTitle: { color: darkTheme.textPrimary, fontSize: 17, fontWeight: "600" },
  cardSummary: { color: darkTheme.textSecondary, fontSize: 13, marginTop: 4 },
  navRow: { flexDirection: "row", gap: 20, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  navLink: { color: darkTheme.textSecondary, fontSize: 14, fontWeight: "600" },
  navLinkActive: { color: darkTheme.accent },
  empty: { padding: 32, alignItems: "center", gap: 8 },
  emptyTitle: { color: darkTheme.textPrimary, fontSize: 17, fontWeight: "600" },
  emptyBody: { color: darkTheme.textSecondary, fontSize: 13, textAlign: "center" },
  addButton: { margin: 16, marginTop: 0, backgroundColor: darkTheme.primary, borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  addButtonText: { color: darkTheme.textOnPrimary, fontWeight: "600", fontSize: 15 },
  detailHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 12 },
  backLink: { color: darkTheme.accent, fontSize: 15 },
  statusText: { color: darkTheme.textSecondary, fontSize: 12 },
  entryTypeBadge: { color: darkTheme.accent, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, paddingHorizontal: 16, paddingTop: 12 },
  nameInput: { color: darkTheme.textPrimary, fontSize: 22, fontWeight: "700", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  summaryWrap: { flex: 1 },
  summaryInput: {
    flex: 1,
    backgroundColor: darkTheme.surfaceManuscript,
    color: darkTheme.surfaceManuscriptText,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 8,
    padding: 16,
    fontSize: 15,
    lineHeight: 22,
  },
});

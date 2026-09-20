import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TextInput, SectionList, Pressable, StyleSheet, ActivityIndicator, RefreshControl, KeyboardAvoidingView, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { darkTheme } from "@inkwell/design-tokens";
import { toCamelRow, type StoryboardCard } from "@inkwell/shared-types";
import { getSupabase } from "../../../lib/supabase";

const AUTOSAVE_IDLE_MS = 1500;
const DEFAULT_COLUMN = "Act 1";

/**
 * A deliberately simple mobile storyboard for v0: cards grouped into columns (sections), with
 * "move up"/"move down"/"move to column" as the real alternative to drag-and-drop — same
 * philosophy as the web storyboard's keyboard-accessible reordering, not a lesser afterthought.
 * No POV/location/character/thread linking UI yet. See docs/IMPLEMENTATION_STATUS.md.
 */
export default function StoryboardScreen() {
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [cards, setCards] = useState<StoryboardCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [column, setColumn] = useState("");
  const [fieldsSyncedFor, setFieldsSyncedFor] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "saving">("saved");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setError(null);
    const { data, error } = await getSupabase().from("storyboard_cards").select("*").eq("project_id", projectId).order("column").order("sort_order");
    if (error) setError(error.message);
    else setCards((data ?? []).map((row) => toCamelRow<StoryboardCard>(row)));
    setLoading(false);
    setRefreshing(false);
  }, [projectId]);

  // Fetches on mount/projectId change — setState only happens after the await resolves, not
  // synchronously in the effect body, so this is the standard React-docs "fetch on mount" pattern.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const selected = cards.find((c) => c.id === selectedId) ?? null;

  // Load the selected card's fields into the editable text-input state whenever selection
  // changes — adjusted directly during render (React's documented pattern) rather than in an
  // effect, since it's a pure sync from already-fetched data, not an external system.
  if (selected && selected.id !== fieldsSyncedFor) {
    setFieldsSyncedFor(selected.id);
    setTitle(selected.title);
    setSummary(selected.summary ?? "");
    setColumn(selected.column);
  }

  function scheduleSave(nextTitle: string, nextSummary: string, nextColumn: string) {
    if (!selected) return;
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      // `as never`: the placeholder Database type (not yet generated from a real project) types
      // every table generically, which confuses supabase-js's .update() overload resolution —
      // same cast used in the other book screens and apps/web/src/lib/sync.ts.
      await getSupabase()
        .from("storyboard_cards")
        .update({ title: nextTitle || "Untitled", summary: nextSummary, column: nextColumn || DEFAULT_COLUMN } as never)
        .eq("id", selected.id);
      setCards((prev) =>
        prev.map((c) => (c.id === selected.id ? { ...c, title: nextTitle || "Untitled", summary: nextSummary, column: nextColumn || DEFAULT_COLUMN } : c)),
      );
      setSaveState("saved");
    }, AUTOSAVE_IDLE_MS);
  }

  async function move(card: StoryboardCard, direction: -1 | 1) {
    const columnCards = cards.filter((c) => c.column === card.column).sort((a, b) => a.sortOrder - b.sortOrder);
    const index = columnCards.findIndex((c) => c.id === card.id);
    const targetIndex = index + direction;
    if (index === -1 || targetIndex < 0 || targetIndex >= columnCards.length) return;
    const reordered = [...columnCards];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex]!, reordered[index]!];
    await Promise.all(
      reordered.map((c, i) => getSupabase().from("storyboard_cards").update({ sort_order: i } as never).eq("id", c.id)),
    );
    await load();
  }

  async function addCard() {
    const columnCards = cards.filter((c) => c.column === DEFAULT_COLUMN);
    const { data, error } = await getSupabase()
      .from("storyboard_cards")
      .insert({ project_id: projectId, title: "New scene card", column: DEFAULT_COLUMN, sort_order: columnCards.length } as never)
      .select("*")
      .single();
    if (error || !data) {
      setError(error?.message ?? "Couldn't create card.");
      return;
    }
    const card = toCamelRow<StoryboardCard>(data);
    setCards((prev) => [...prev, card]);
    setSelectedId(card.id);
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
            <Text style={styles.backLink}>‹ All cards</Text>
          </Pressable>
          <Text style={styles.statusText}>{saveState === "saving" ? "Saving…" : "Saved"}</Text>
        </View>
        <TextInput
          style={styles.titleInput}
          value={title}
          onChangeText={(t) => {
            setTitle(t);
            scheduleSave(t, summary, column);
          }}
          placeholder="Card title"
          placeholderTextColor={darkTheme.textSecondary}
          accessibilityLabel="Card title"
        />
        <TextInput
          style={styles.columnInput}
          value={column}
          onChangeText={(t) => {
            setColumn(t);
            scheduleSave(title, summary, t);
          }}
          placeholder="Column (e.g. Act 1)"
          placeholderTextColor={darkTheme.textSecondary}
          accessibilityLabel="Column"
        />
        <SafeAreaView style={styles.summaryWrap} edges={["bottom"]}>
          <TextInput
            style={styles.summaryInput}
            multiline
            value={summary}
            onChangeText={(t) => {
              setSummary(t);
              scheduleSave(title, t, column);
            }}
            placeholder="Summary…"
            placeholderTextColor={darkTheme.textSecondary}
            textAlignVertical="top"
            accessibilityLabel="Card summary"
          />
        </SafeAreaView>
      </KeyboardAvoidingView>
    );
  }

  const columns = Array.from(new Set(cards.map((c) => c.column)));
  if (columns.length === 0) columns.push(DEFAULT_COLUMN);
  const sections = columns.map((col) => ({
    title: col,
    data: cards.filter((c) => c.column === col).sort((a, b) => a.sortOrder - b.sortOrder),
  }));

  return (
    <SafeAreaView style={styles.page} edges={["bottom"]}>
      <View style={styles.navRow}>
        <Pressable onPress={() => router.replace(`/book/${projectId}/manuscript`)} accessibilityRole="button">
          <Text style={styles.navLink}>Manuscript</Text>
        </Pressable>
        <Pressable onPress={() => router.replace(`/book/${projectId}/story-bible`)} accessibilityRole="button">
          <Text style={styles.navLink}>Story Bible</Text>
        </Pressable>
        <Pressable onPress={() => router.replace(`/book/${projectId}/timeline`)} accessibilityRole="button">
          <Text style={styles.navLink}>Timeline</Text>
        </Pressable>
        <Text style={[styles.navLink, styles.navLinkActive]}>Storyboard</Text>
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      <SectionList
        sections={sections}
        keyExtractor={(c) => c.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={darkTheme.accent} />}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        renderSectionHeader={({ section }) => <Text style={styles.sectionHeader}>{section.title}</Text>}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No storyboard cards yet</Text>
            <Text style={styles.emptyBody}>Add your first scene card below.</Text>
          </View>
        }
        renderItem={({ item, index, section }) => (
          <View style={styles.card}>
            <Pressable style={styles.cardMain} onPress={() => setSelectedId(item.id)} accessibilityRole="button">
              <Text style={styles.cardTitle}>{item.title}</Text>
              {item.summary ? (
                <Text style={styles.cardSummary} numberOfLines={2}>
                  {item.summary}
                </Text>
              ) : null}
            </Pressable>
            <View style={styles.cardMoves}>
              <Pressable
                onPress={() => move(item, -1)}
                disabled={index === 0}
                style={[styles.moveButton, index === 0 && styles.moveButtonDisabled]}
                accessibilityRole="button"
                accessibilityLabel="Move up"
              >
                <Text style={styles.moveButtonText}>↑</Text>
              </Pressable>
              <Pressable
                onPress={() => move(item, 1)}
                disabled={index === section.data.length - 1}
                style={[styles.moveButton, index === section.data.length - 1 && styles.moveButtonDisabled]}
                accessibilityRole="button"
                accessibilityLabel="Move down"
              >
                <Text style={styles.moveButtonText}>↓</Text>
              </Pressable>
            </View>
          </View>
        )}
      />
      <Pressable style={styles.addButton} onPress={addCard} accessibilityRole="button">
        <Text style={styles.addButtonText}>+ New Card ({DEFAULT_COLUMN})</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: darkTheme.bg },
  center: { flex: 1, backgroundColor: darkTheme.bg, alignItems: "center", justifyContent: "center" },
  error: { color: darkTheme.danger, paddingHorizontal: 16, paddingTop: 12 },
  navRow: { flexDirection: "row", gap: 16, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  navLink: { color: darkTheme.textSecondary, fontSize: 13, fontWeight: "600" },
  navLinkActive: { color: darkTheme.accent },
  sectionHeader: { color: darkTheme.accent, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginTop: 12, marginBottom: 6 },
  card: { flexDirection: "row", backgroundColor: darkTheme.bgElevated, borderRadius: 12, borderWidth: 1, borderColor: darkTheme.border, overflow: "hidden" },
  cardMain: { flex: 1, padding: 16 },
  cardTitle: { color: darkTheme.textPrimary, fontSize: 16, fontWeight: "600" },
  cardSummary: { color: darkTheme.textSecondary, fontSize: 13, marginTop: 4 },
  cardMoves: { justifyContent: "center", paddingHorizontal: 8, gap: 6 },
  moveButton: { width: 32, height: 32, borderRadius: 8, backgroundColor: darkTheme.bg, alignItems: "center", justifyContent: "center" },
  moveButtonDisabled: { opacity: 0.3 },
  moveButtonText: { color: darkTheme.textPrimary, fontSize: 15 },
  empty: { padding: 32, alignItems: "center", gap: 8 },
  emptyTitle: { color: darkTheme.textPrimary, fontSize: 17, fontWeight: "600" },
  emptyBody: { color: darkTheme.textSecondary, fontSize: 13, textAlign: "center" },
  addButton: { margin: 16, marginTop: 0, backgroundColor: darkTheme.primary, borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  addButtonText: { color: darkTheme.textOnPrimary, fontWeight: "600", fontSize: 15 },
  detailHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 12 },
  backLink: { color: darkTheme.accent, fontSize: 15 },
  statusText: { color: darkTheme.textSecondary, fontSize: 12 },
  titleInput: { color: darkTheme.textPrimary, fontSize: 22, fontWeight: "700", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  columnInput: { color: darkTheme.accent, fontSize: 14, paddingHorizontal: 16, paddingBottom: 12 },
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

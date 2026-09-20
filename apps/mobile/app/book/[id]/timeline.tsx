import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { darkTheme } from "@inkwell/design-tokens";
import { toCamelRow, type TimelineEvent } from "@inkwell/shared-types";
import { getSupabase } from "../../../lib/supabase";

const AUTOSAVE_IDLE_MS = 1500;

/**
 * A deliberately simple mobile timeline for v0: a flat ordered list (no fictional-calendar
 * support, no conflict detection, no linked scenes/characters UI) with inline label/when/detail
 * editing — same scope philosophy as manuscript.tsx and story-bible.tsx. Real, working, honestly
 * narrow. See docs/IMPLEMENTATION_STATUS.md.
 */
export default function TimelineScreen() {
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [whenLabel, setWhenLabel] = useState("");
  const [detail, setDetail] = useState("");
  const [fieldsSyncedFor, setFieldsSyncedFor] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "saving">("saved");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setError(null);
    const { data, error } = await getSupabase().from("timeline_events").select("*").eq("project_id", projectId).order("sort_order");
    if (error) setError(error.message);
    else setEvents((data ?? []).map((row) => toCamelRow<TimelineEvent>(row)));
    setLoading(false);
    setRefreshing(false);
  }, [projectId]);

  // Fetches on mount/projectId change — setState only happens after the await resolves, not
  // synchronously in the effect body, so this is the standard React-docs "fetch on mount" pattern.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const selected = events.find((e) => e.id === selectedId) ?? null;

  // Load the selected event's fields into the editable text-input state whenever selection
  // changes — adjusted directly during render (React's documented pattern) rather than in an
  // effect, since it's a pure sync from already-fetched data, not an external system.
  if (selected && selected.id !== fieldsSyncedFor) {
    setFieldsSyncedFor(selected.id);
    setLabel(selected.label);
    setWhenLabel(selected.whenLabel);
    setDetail(selected.detail ?? "");
  }

  function scheduleSave(nextLabel: string, nextWhenLabel: string, nextDetail: string) {
    if (!selected) return;
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      // `as never`: the placeholder Database type (not yet generated from a real project) types
      // every table generically, which confuses supabase-js's .update() overload resolution —
      // same cast used in manuscript.tsx, story-bible.tsx, and apps/web/src/lib/sync.ts.
      await getSupabase()
        .from("timeline_events")
        .update({ label: nextLabel || "New event", when_label: nextWhenLabel, detail: nextDetail || null } as never)
        .eq("id", selected.id);
      setEvents((prev) =>
        prev.map((e) => (e.id === selected.id ? { ...e, label: nextLabel || "New event", whenLabel: nextWhenLabel, detail: nextDetail || null } : e)),
      );
      setSaveState("saved");
    }, AUTOSAVE_IDLE_MS);
  }

  async function addEvent() {
    const { data, error } = await getSupabase()
      .from("timeline_events")
      .insert({ project_id: projectId, label: "New event", sort_order: events.length } as never)
      .select("*")
      .single();
    if (error || !data) {
      setError(error?.message ?? "Couldn't create event.");
      return;
    }
    const event = toCamelRow<TimelineEvent>(data);
    setEvents((prev) => [...prev, event]);
    setSelectedId(event.id);
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
            <Text style={styles.backLink}>‹ All events</Text>
          </Pressable>
          <Text style={styles.statusText}>{saveState === "saving" ? "Saving…" : "Saved"}</Text>
        </View>
        <TextInput
          style={styles.labelInput}
          value={label}
          onChangeText={(t) => {
            setLabel(t);
            scheduleSave(t, whenLabel, detail);
          }}
          placeholder="Event label"
          placeholderTextColor={darkTheme.textSecondary}
          accessibilityLabel="Event label"
        />
        <TextInput
          style={styles.whenInput}
          value={whenLabel}
          onChangeText={(t) => {
            setWhenLabel(t);
            scheduleSave(label, t, detail);
          }}
          placeholder="When (e.g. Day 1, 9 years ago)"
          placeholderTextColor={darkTheme.textSecondary}
          accessibilityLabel="When this happens in-story"
        />
        <SafeAreaView style={styles.detailWrap} edges={["bottom"]}>
          <TextInput
            style={styles.detailInput}
            multiline
            value={detail}
            onChangeText={(t) => {
              setDetail(t);
              scheduleSave(label, whenLabel, t);
            }}
            placeholder="Detail…"
            placeholderTextColor={darkTheme.textSecondary}
            textAlignVertical="top"
            accessibilityLabel="Event detail"
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
        <Pressable onPress={() => router.replace(`/book/${projectId}/story-bible`)} accessibilityRole="button">
          <Text style={styles.navLink}>Story Bible</Text>
        </Pressable>
        <Text style={[styles.navLink, styles.navLinkActive]}>Timeline</Text>
        <Pressable onPress={() => router.replace(`/book/${projectId}/ai-assistant`)} accessibilityRole="button">
          <Text style={styles.navLink}>AI Assistant</Text>
        </Pressable>
        <Pressable onPress={() => router.replace(`/book/${projectId}/storyboard`)} accessibilityRole="button">
          <Text style={styles.navLink}>Storyboard</Text>
        </Pressable>
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      <FlatList
        data={events}
        keyExtractor={(e) => e.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={darkTheme.accent}
          />
        }
        contentContainerStyle={{ padding: 16, gap: 10 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No timeline events yet</Text>
            <Text style={styles.emptyBody}>Add your first event below.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => setSelectedId(item.id)} accessibilityRole="button">
            {item.whenLabel ? <Text style={styles.cardWhen}>{item.whenLabel}</Text> : null}
            <Text style={styles.cardTitle}>{item.label}</Text>
          </Pressable>
        )}
      />
      <Pressable style={styles.addButton} onPress={addEvent} accessibilityRole="button">
        <Text style={styles.addButtonText}>+ New Event</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: darkTheme.bg },
  center: { flex: 1, backgroundColor: darkTheme.bg, alignItems: "center", justifyContent: "center" },
  error: { color: darkTheme.danger, paddingHorizontal: 16, paddingTop: 12 },
  navRow: { flexDirection: "row", gap: 20, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  navLink: { color: darkTheme.textSecondary, fontSize: 14, fontWeight: "600" },
  navLinkActive: { color: darkTheme.accent },
  card: { backgroundColor: darkTheme.bgElevated, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: darkTheme.border },
  cardWhen: { color: darkTheme.accent, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  cardTitle: { color: darkTheme.textPrimary, fontSize: 17, fontWeight: "600" },
  empty: { padding: 32, alignItems: "center", gap: 8 },
  emptyTitle: { color: darkTheme.textPrimary, fontSize: 17, fontWeight: "600" },
  emptyBody: { color: darkTheme.textSecondary, fontSize: 13, textAlign: "center" },
  addButton: { margin: 16, marginTop: 0, backgroundColor: darkTheme.primary, borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  addButtonText: { color: darkTheme.textOnPrimary, fontWeight: "600", fontSize: 15 },
  detailHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 12 },
  backLink: { color: darkTheme.accent, fontSize: 15 },
  statusText: { color: darkTheme.textSecondary, fontSize: 12 },
  labelInput: { color: darkTheme.textPrimary, fontSize: 22, fontWeight: "700", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  whenInput: { color: darkTheme.accent, fontSize: 14, paddingHorizontal: 16, paddingBottom: 12 },
  detailWrap: { flex: 1 },
  detailInput: {
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

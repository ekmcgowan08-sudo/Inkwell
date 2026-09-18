import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TextInput, ScrollView, Pressable, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { darkTheme } from "@inkwell/design-tokens";
import { countWords, toCamelRow, type Chapter, type Scene } from "@inkwell/shared-types";
import { getSupabase } from "../../../lib/supabase";

const AUTOSAVE_IDLE_MS = 1500;

/**
 * A deliberately simple mobile editor for v0: one plain-text field per
 * scene, autosaved on a debounce like the web editor, but WITHOUT rich
 * formatting (bold/italic/scene breaks) — it round-trips `plain_text` only
 * and wraps it as a single paragraph when writing `content` back, so a
 * richly-formatted scene edited here will lose that formatting. This is a
 * real, working, and honestly-scoped v0, not the full mobile editor
 * described in the product spec — see docs/IMPLEMENTATION_STATUS.md.
 */
export default function ManuscriptScreen() {
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [activeScene, setActiveScene] = useState<Scene | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<"saved" | "saving">("saved");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await getSupabase()
        .from("chapters")
        .select("*")
        .eq("project_id", projectId)
        .is("deleted_at", null)
        .order("sort_order");
      const rows = (data ?? []).map((r) => toCamelRow<Chapter>(r));
      setChapters(rows);
      if (rows[0]) setActiveChapterId(rows[0].id);
      setLoading(false);
    })();
  }, [projectId]);

  useEffect(() => {
    if (!activeChapterId) return;
    (async () => {
      const { data } = await getSupabase()
        .from("scenes")
        .select("*")
        .eq("chapter_id", activeChapterId)
        .is("deleted_at", null)
        .order("sort_order")
        .limit(1);
      const scene = data?.[0] ? toCamelRow<Scene>(data[0]) : null;
      setActiveScene(scene);
      setText(scene?.plainText ?? "");
    })();
  }, [activeChapterId]);

  const save = useCallback(
    (nextText: string) => {
      if (!activeScene) return;
      setSaveState("saving");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        // `as never`: the placeholder Database type (packages/api-client/src/database.types.ts,
        // not yet generated from a real project) types every table as a generic Record, which
        // confuses supabase-js's `.update()` overload resolution — same cast apps/web's sync.ts
        // uses for the same reason. Runtime behavior against PostgREST is unaffected either way.
        await getSupabase()
          .from("scenes")
          .update({
            plain_text: nextText,
            word_count: countWords(nextText),
            content: { type: "doc", content: [{ type: "paragraph", content: nextText ? [{ type: "text", text: nextText }] : [] }] },
            revision: activeScene.revision + 1,
          } as never)
          .eq("id", activeScene.id);
        setSaveState("saved");
      }, AUTOSAVE_IDLE_MS);
    },
    [activeScene],
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={darkTheme.accent} />
      </SafeAreaView>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.navRow}>
        <Text style={[styles.navLink, styles.navLinkActive]}>Manuscript</Text>
        <Pressable onPress={() => router.replace(`/book/${projectId}/story-bible`)} accessibilityRole="button">
          <Text style={styles.navLink}>Story Bible</Text>
        </Pressable>
        <Pressable onPress={() => router.replace(`/book/${projectId}/timeline`)} accessibilityRole="button">
          <Text style={styles.navLink}>Timeline</Text>
        </Pressable>
        <Pressable onPress={() => router.replace(`/book/${projectId}/ai-assistant`)} accessibilityRole="button">
          <Text style={styles.navLink}>AI Assistant</Text>
        </Pressable>
        <Pressable onPress={() => router.replace(`/book/${projectId}/storyboard`)} accessibilityRole="button">
          <Text style={styles.navLink}>Storyboard</Text>
        </Pressable>
      </View>
      <ScrollView horizontal style={styles.chapterBar} showsHorizontalScrollIndicator={false}>
        {chapters.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => setActiveChapterId(c.id)}
            style={[styles.chapterChip, c.id === activeChapterId && styles.chapterChipActive]}
          >
            <Text style={[styles.chapterChipText, c.id === activeChapterId && styles.chapterChipTextActive]}>{c.title}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.statusRow}>
        <Text style={styles.statusText}>{countWords(text)} words</Text>
        <Text style={styles.statusText}>{saveState === "saving" ? "Saving…" : "Saved"}</Text>
      </View>
      <SafeAreaView style={styles.editorWrap} edges={["bottom"]}>
        <TextInput
          style={styles.editor}
          multiline
          value={text}
          onChangeText={(t) => {
            setText(t);
            save(t);
          }}
          placeholder="Begin writing…"
          placeholderTextColor={darkTheme.textSecondary}
          textAlignVertical="top"
          accessibilityLabel="Scene text"
        />
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: darkTheme.bg },
  center: { flex: 1, backgroundColor: darkTheme.bg, alignItems: "center", justifyContent: "center" },
  navRow: { flexDirection: "row", gap: 20, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  navLink: { color: darkTheme.textSecondary, fontSize: 14, fontWeight: "600" },
  navLinkActive: { color: darkTheme.accent },
  chapterBar: { flexGrow: 0, paddingHorizontal: 12, paddingVertical: 10 },
  chapterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: darkTheme.bgElevated, marginRight: 8, minHeight: 40, justifyContent: "center" },
  chapterChipActive: { backgroundColor: darkTheme.primary },
  chapterChipText: { color: darkTheme.textSecondary, fontSize: 13 },
  chapterChipTextActive: { color: darkTheme.textOnPrimary, fontWeight: "600" },
  statusRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 6 },
  statusText: { color: darkTheme.textSecondary, fontSize: 12 },
  editorWrap: { flex: 1 },
  editor: {
    flex: 1,
    backgroundColor: darkTheme.surfaceManuscript,
    color: darkTheme.surfaceManuscriptText,
    margin: 12,
    borderRadius: 8,
    padding: 18,
    fontSize: 16,
    lineHeight: 24,
  },
});

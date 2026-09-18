import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TextInput, FlatList, Pressable, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { darkTheme } from "@inkwell/design-tokens";
import { toCamelRow, type AIMessage } from "@inkwell/shared-types";
import { getSupabase } from "../../../lib/supabase";

/**
 * A deliberately simple mobile AI Assistant for v0: a single "ask" conversation per book, no mode
 * picker, no series scope, no citation rendering — same scope philosophy as the other v0 book
 * screens. Unlike them, there's no local cache to keep in sync: this reads straight from Postgres
 * (ai_conversations/ai_messages, both RLS-protected) after every exchange, since mobile has no
 * on-device local-first store yet. See docs/IMPLEMENTATION_STATUS.md.
 */
export default function AIAssistantScreen() {
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);

  const loadMessages = useCallback(async (convoId: string) => {
    const { data } = await getSupabase().from("ai_messages").select("*").eq("conversation_id", convoId).order("created_at");
    setMessages((data ?? []).map((row) => toCamelRow<AIMessage>(row)));
  }, []);

  useEffect(() => {
    (async () => {
      if (!projectId) return;
      // `as` cast: the placeholder Database type (not yet generated from a real project) resolves
      // a projected .select("id") to `never`, same underlying quirk as the `as never` casts on
      // .update()/.insert() calls elsewhere (manuscript.tsx, story-bible.tsx, timeline.tsx).
      const { data } = (await getSupabase()
        .from("ai_conversations")
        .select("id")
        .eq("project_id", projectId)
        .order("updated_at", { ascending: false })
        .limit(1)) as { data: { id: string }[] | null };
      const existingId = data?.[0]?.id;
      if (existingId) {
        setConversationId(existingId);
        await loadMessages(existingId);
      }
      setLoading(false);
    })();
  }, [projectId, loadMessages]);

  useEffect(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, [messages.length, sending]);

  async function send() {
    const question = input.trim();
    if (!question || sending) return;
    setInput("");
    setSending(true);
    setError(null);
    try {
      const { data, error: invokeError } = await getSupabase().functions.invoke("ai-assistant", {
        body: { projectId, mode: "ask", question, conversationId, seriesScope: false },
      });
      if (invokeError) throw invokeError;
      const newConversationId = (data as { conversationId: string }).conversationId;
      setConversationId(newConversationId);
      await loadMessages(newConversationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The AI assistant is unavailable right now.");
    } finally {
      setSending(false);
    }
  }

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
        <Pressable onPress={() => router.replace(`/book/${projectId}/manuscript`)} accessibilityRole="button">
          <Text style={styles.navLink}>Manuscript</Text>
        </Pressable>
        <Pressable onPress={() => router.replace(`/book/${projectId}/story-bible`)} accessibilityRole="button">
          <Text style={styles.navLink}>Story Bible</Text>
        </Pressable>
        <Pressable onPress={() => router.replace(`/book/${projectId}/timeline`)} accessibilityRole="button">
          <Text style={styles.navLink}>Timeline</Text>
        </Pressable>
        <Text style={[styles.navLink, styles.navLinkActive]}>AI Assistant</Text>
        <Pressable onPress={() => router.replace(`/book/${projectId}/storyboard`)} accessibilityRole="button">
          <Text style={styles.navLink}>Storyboard</Text>
        </Pressable>
      </View>
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Ask about this book</Text>
            <Text style={styles.emptyBody}>The assistant reads this book's manuscript, story bible, and timeline — nothing else.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.role === "user" ? styles.bubbleUser : styles.bubbleAssistant]}>
            <Text style={styles.bubbleText}>{item.content}</Text>
          </View>
        )}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      {sending && (
        <View style={styles.thinkingRow}>
          <ActivityIndicator size="small" color={darkTheme.accent} />
          <Text style={styles.thinkingText}>Thinking…</Text>
        </View>
      )}
      <SafeAreaView style={styles.composer} edges={["bottom"]}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Ask about plot, consistency, or timeline…"
          placeholderTextColor={darkTheme.textSecondary}
          accessibilityLabel="Ask the AI assistant"
          multiline
        />
        <Pressable
          style={[styles.sendButton, (!input.trim() || sending) && styles.sendButtonDisabled]}
          onPress={send}
          disabled={!input.trim() || sending}
          accessibilityRole="button"
          accessibilityLabel="Send message"
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </Pressable>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: darkTheme.bg },
  center: { flex: 1, backgroundColor: darkTheme.bg, alignItems: "center", justifyContent: "center" },
  navRow: { flexDirection: "row", gap: 16, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  navLink: { color: darkTheme.textSecondary, fontSize: 13, fontWeight: "600" },
  navLinkActive: { color: darkTheme.accent },
  error: { color: darkTheme.danger, paddingHorizontal: 16, paddingBottom: 6, fontSize: 13 },
  empty: { padding: 32, alignItems: "center", gap: 8 },
  emptyTitle: { color: darkTheme.textPrimary, fontSize: 17, fontWeight: "600" },
  emptyBody: { color: darkTheme.textSecondary, fontSize: 13, textAlign: "center" },
  bubble: { borderRadius: 12, padding: 12, maxWidth: "85%" },
  bubbleUser: { backgroundColor: darkTheme.primary, alignSelf: "flex-end" },
  bubbleAssistant: { backgroundColor: darkTheme.bgElevated, alignSelf: "flex-start", borderWidth: 1, borderColor: darkTheme.border },
  bubbleText: { color: darkTheme.textPrimary, fontSize: 15, lineHeight: 21 },
  thinkingRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingBottom: 6 },
  thinkingText: { color: darkTheme.textSecondary, fontSize: 13 },
  composer: { flexDirection: "row", gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: darkTheme.border, alignItems: "flex-end" },
  input: { flex: 1, backgroundColor: darkTheme.bgElevated, color: darkTheme.textPrimary, borderRadius: 10, padding: 12, fontSize: 15, maxHeight: 100 },
  sendButton: { backgroundColor: darkTheme.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12 },
  sendButtonDisabled: { opacity: 0.4 },
  sendButtonText: { color: darkTheme.textOnPrimary, fontWeight: "600" },
});

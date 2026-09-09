import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter } from "expo-router";
import { darkTheme, brand } from "@inkwell/design-tokens";
import { useAuth } from "../lib/auth";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setBusy(true);
    setError(null);
    const { error } = await signIn(email, password);
    setBusy(false);
    if (error) setError(error);
    else router.replace("/(tabs)");
  }

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Text style={styles.brand}>Inkwell</Text>
      <Text style={styles.subtitle}>Sign in to your writing studio</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={darkTheme.textSecondary}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        accessibilityLabel="Email"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor={darkTheme.textSecondary}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        accessibilityLabel="Password"
      />
      {error && (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      )}
      <Pressable style={styles.button} onPress={onSubmit} disabled={busy} accessibilityRole="button">
        <Text style={styles.buttonText}>{busy ? "Signing in…" : "Sign in"}</Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: darkTheme.bg, justifyContent: "center", padding: 24, gap: 12 },
  brand: { fontSize: 28, fontWeight: "700", color: brand.gold, textAlign: "center" },
  subtitle: { fontSize: 14, color: darkTheme.textSecondary, textAlign: "center", marginBottom: 16 },
  input: {
    backgroundColor: darkTheme.bgElevated,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: darkTheme.border,
    color: darkTheme.textPrimary,
    padding: 14,
    minHeight: 48,
  },
  error: { color: darkTheme.danger, fontSize: 13 },
  button: { backgroundColor: darkTheme.primary, borderRadius: 8, padding: 14, alignItems: "center", minHeight: 48, justifyContent: "center" },
  buttonText: { color: darkTheme.textOnPrimary, fontWeight: "600" },
});

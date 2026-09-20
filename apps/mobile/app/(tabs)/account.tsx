import { Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { darkTheme } from "@inkwell/design-tokens";
import { useAuth } from "../../lib/auth";

export default function AccountScreen() {
  const { email, signOut } = useAuth();
  const router = useRouter();

  return (
    <SafeAreaView style={styles.page} edges={["top"]}>
      <Text style={styles.title}>Account</Text>
      <Text style={styles.email}>{email}</Text>
      <Pressable
        style={styles.button}
        accessibilityRole="button"
        onPress={async () => {
          await signOut();
          router.replace("/login");
        }}
      >
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
      <Text style={styles.note}>
        Biometric app lock, offline writing, and the rest of Inkwell's mobile screens (story bible, storyboard,
        timeline, AI assistant) are planned but not yet built for mobile — see docs/IMPLEMENTATION_STATUS.md.
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: darkTheme.bg, padding: 16, gap: 16 },
  title: { fontSize: 24, fontWeight: "700", color: darkTheme.textPrimary },
  email: { fontSize: 14, color: darkTheme.textSecondary },
  button: { backgroundColor: darkTheme.bgElevated, borderRadius: 8, padding: 14, alignItems: "center", minHeight: 48, justifyContent: "center", borderWidth: 1, borderColor: darkTheme.border },
  buttonText: { color: darkTheme.textPrimary, fontWeight: "600" },
  note: { color: darkTheme.textSecondary, fontSize: 12, marginTop: 24, lineHeight: 18 },
});

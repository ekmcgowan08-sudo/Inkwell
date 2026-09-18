import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "../lib/auth";
import { darkTheme } from "@inkwell/design-tokens";

/**
 * Root layout. This is a lean v0 mobile scaffold — see
 * docs/IMPLEMENTATION_STATUS.md "Phase 8/9" for exactly what is and isn't
 * built yet. It reuses @inkwell/shared-types, @inkwell/design-tokens, and
 * @inkwell/api-client with the web app, per the "don't maintain separate
 * implementations of business rules" requirement, but does not yet have
 * its own local-first offline store (mobile always needs a configured
 * Supabase backend today).
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: darkTheme.bgElevated },
            headerTintColor: darkTheme.textPrimary,
            contentStyle: { backgroundColor: darkTheme.bg },
          }}
        >
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="book/[id]/manuscript" options={{ title: "Manuscript" }} />
          <Stack.Screen name="book/[id]/story-bible" options={{ title: "Story Bible" }} />
          <Stack.Screen name="book/[id]/timeline" options={{ title: "Timeline" }} />
          <Stack.Screen name="book/[id]/ai-assistant" options={{ title: "AI Assistant" }} />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

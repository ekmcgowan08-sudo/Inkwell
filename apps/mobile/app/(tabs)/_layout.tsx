import { Tabs } from "expo-router";
import { Text } from "react-native";
import { darkTheme } from "@inkwell/design-tokens";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: darkTheme.accent,
        tabBarInactiveTintColor: darkTheme.textSecondary,
        tabBarStyle: { backgroundColor: darkTheme.bgElevated, borderTopColor: darkTheme.border },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Library", tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>📚</Text> }} />
      <Tabs.Screen name="account" options={{ title: "Account", tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>⚙️</Text> }} />
    </Tabs>
  );
}

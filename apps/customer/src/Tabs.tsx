import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

const TABS = ["Shop", "Orders", "Account"] as const;
export type Tab = (typeof TABS)[number];

export function Tabs({
  current,
  onChange,
  children,
}: {
  current: Tab;
  onChange: (tab: Tab) => void;
  children: ReactNode;
}) {
  return (
    <View style={styles.shell}>
      <View style={styles.content}>{children}</View>
      <View style={styles.bar} accessibilityRole="tablist">
        {TABS.map((tab) => {
          const selected = tab === current;
          return (
            <Pressable
              key={tab}
              style={styles.tab}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => onChange(tab)}
            >
              <Text style={[styles.label, selected && styles.selected]}>{tab}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1 },
  content: { flex: 1 },
  bar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#e2e5e9",
  },
  tab: { flex: 1, alignItems: "center", paddingVertical: 14 },
  label: { fontSize: 15, color: "#5f6670" },
  selected: { color: "#1f5fbf", fontWeight: "600" },
});

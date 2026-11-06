import type { Driver } from "@courier/api-client";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatShopTime } from "./shop-time";

export interface OnDutyProps {
  readonly driver: Driver;
  readonly busy: boolean;
  readonly onSignOut: () => void;
}

/** Who is signed in on this phone, and since when they have been On duty. */
export function OnDuty({ driver, busy, onSignOut }: OnDutyProps) {
  return (
    <View style={styles.bar}>
      <View style={styles.who}>
        <Text style={styles.name}>{driver.name}</Text>
        <Text style={styles.duty}>
          {driver.onDuty
            ? `On duty${driver.onDutyChangedAt ? ` since ${formatShopTime(driver.onDutyChangedAt)}` : ""}`
            : "Off duty"}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityHint="Signing out takes you off duty"
        accessibilityState={{ disabled: busy, busy }}
        disabled={busy}
        onPress={onSignOut}
        style={styles.signOut}
      >
        <Text style={styles.signOutText}>{busy ? "Signing out…" : "Sign out"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  who: { gap: 2 },
  name: { fontSize: 18, fontWeight: "600" },
  duty: { color: "#1a7f37" },
  signOut: { padding: 8 },
  signOutText: { color: "#1f5fbf", fontSize: 16 },
});

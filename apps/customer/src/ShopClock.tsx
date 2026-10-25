import { type CourierClient, fetchServerClock } from "@courier/api-client";
import type { ServerClock } from "@courier/domain";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

type ClockState =
  | { readonly state: "loading" }
  | { readonly state: "ready"; readonly clock: ServerClock }
  | { readonly state: "error"; readonly message: string };

/** The shop clock, read once from `server_clock`. Never the phone's own idea of now. */
export function ShopClock({ client }: { client: CourierClient }) {
  const [view, setView] = useState<ClockState>({ state: "loading" });

  useEffect(() => {
    let live = true;

    void (async () => {
      try {
        const clock = await fetchServerClock(client);
        if (live) setView({ state: "ready", clock });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (live) setView({ state: "error", message });
      }
    })();

    return () => {
      live = false;
    };
  }, [client]);

  return (
    <View style={styles.clock} accessibilityLabel="Shop clock">
      {view.state === "loading" && <Text>Reading the shop clock…</Text>}
      {view.state === "ready" && (
        <>
          <Text style={styles.time}>{timeOfDay(view.clock.localTime)}</Text>
          <Text>
            {view.clock.localDate} · {view.clock.timeZone}
          </Text>
        </>
      )}
      {view.state === "error" && (
        <>
          <Text style={styles.time}>Could not reach the shop clock</Text>
          <Text>{view.message}</Text>
        </>
      )}
    </View>
  );
}

/** `2026-09-26T15:30:00` → `15:30:00`. The date is shown separately. */
function timeOfDay(localTime: string): string {
  return localTime.split("T")[1] ?? localTime;
}

const styles = StyleSheet.create({
  clock: { paddingHorizontal: 16, paddingBottom: 16 },
  time: { fontSize: 32, fontVariant: ["tabular-nums"] },
});

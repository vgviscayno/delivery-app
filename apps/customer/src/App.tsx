import { createCourierClient } from "@courier/api-client";
import Mapbox from "@rnmapbox/maps";
import { StatusBar } from "expo-status-bar";
import { useMemo } from "react";
import { StyleSheet, Text } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { readAppBackend } from "./backend";
import { ShopClock } from "./ShopClock";
import { ShopMap } from "./ShopMap";

export function App() {
  const setup = useMemo(() => {
    try {
      const { backend, mapboxToken } = readAppBackend();
      // Set once, before any map mounts. The style carries no token of its own.
      if (mapboxToken) Mapbox.setAccessToken(mapboxToken);
      return { client: createCourierClient(backend), hasMapToken: Boolean(mapboxToken) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        <StatusBar style="dark" />
        <Text style={styles.title}>Courier</Text>
        {"error" in setup ? (
          <Text style={styles.error}>{setup.error}</Text>
        ) : (
          <>
            <ShopClock client={setup.client} />
            <ShopMap hasToken={setup.hasMapToken} />
          </>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#ffffff" },
  title: { fontSize: 20, fontWeight: "600", padding: 16 },
  error: { color: "#b00020", padding: 16, fontFamily: "monospace" },
});

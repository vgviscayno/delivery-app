import type { ExpoConfig } from "expo/config";

/**
 * Written by `eas init` when the EAS project is created and linked. Until then there is
 * no update URL, and dev builds and `expo prebuild` don't need one.
 */
const EAS_PROJECT_ID: string | undefined = undefined;

function easProject(projectId: string | undefined): Partial<ExpoConfig> {
  if (!projectId) return {};
  return {
    updates: { url: `https://u.expo.dev/${projectId}` },
    extra: { eas: { projectId } },
  };
}

const config: ExpoConfig = {
  name: "Courier Driver",
  slug: "courier-driver",
  scheme: "courier-driver",
  version: "0.0.0",
  orientation: "portrait",
  // Android only for now. iOS, when it comes, is the customer app (ADR 0013).
  platforms: ["android"],
  android: {
    package: "com.courierops.driver",
  },
  // OTA updates are matched to the native build by fingerprint, so a JS update can never
  // land on a binary whose native side (Transistorsoft, Mapbox) it wasn't built against.
  runtimeVersion: { policy: "fingerprint" },
  ...easProject(EAS_PROJECT_ID),
  plugins: [
    "expo-dev-client",
    "expo-updates",
    // No licence: the pilot is a debug build, where Transistorsoft runs unlicensed
    // (ADR 0009). The release build needs one before it ships.
    "react-native-background-geolocation",
    // Mapbox's own native SDK. The download token is no longer needed for v11; the
    // public access token is set at runtime from EXPO_PUBLIC_MAPBOX_TOKEN.
    ["@rnmapbox/maps", { RNMapboxMapsImpl: "mapbox" }],
  ],
};

export default config;

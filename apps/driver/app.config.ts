import type { ExpoConfig } from "expo/config";

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
  platforms: ["android"],
  android: {
    package: "com.courierops.driver",
  },
  runtimeVersion: { policy: "fingerprint" },
  ...easProject(EAS_PROJECT_ID),
  plugins: [
    "expo-dev-client",
    "expo-updates",
    "expo-secure-store",
    "react-native-background-geolocation",
    ["@rnmapbox/maps", { RNMapboxMapsImpl: "mapbox" }],
  ],
};

export default config;

import { Camera, CircleLayer, MapView, ShapeSource } from "@rnmapbox/maps";
import { StyleSheet, Text } from "react-native";
import { MAP_STYLE_JSON, SHOP_CAMERA } from "./shop-map";

const SHOP_PIN_SHAPE = {
  type: "Feature" as const,
  properties: {},
  geometry: { type: "Point" as const, coordinates: SHOP_CAMERA.centerCoordinate },
};

/** Proof of wiring: the shared style, centred on the Shop pin. */
export function ShopMap({ hasToken }: { hasToken: boolean }) {
  if (!hasToken) {
    return (
      <Text style={styles.missing}>
        EXPO_PUBLIC_MAPBOX_TOKEN is not set, so there is no map.
      </Text>
    );
  }

  return (
    <MapView style={styles.map} styleJSON={MAP_STYLE_JSON} scaleBarEnabled={false}>
      <Camera defaultSettings={SHOP_CAMERA} />
      <ShapeSource id="shop-pin" shape={SHOP_PIN_SHAPE}>
        <CircleLayer
          id="shop-pin"
          style={{
            circleRadius: 8,
            circleColor: "#d9480f",
            circleStrokeColor: "#ffffff",
            circleStrokeWidth: 2,
          }}
        />
      </ShapeSource>
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
  missing: { padding: 16, color: "#6b6b6b" },
});

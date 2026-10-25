import { type LatLng, MAP_STYLE, SHOP_PIN } from "@courier/config";

/** A position as Mapbox takes it: `[longitude, latitude]`. */
export type MapCoordinate = [longitude: number, latitude: number];

export function toMapCoordinate(point: LatLng): MapCoordinate {
  return [point.longitude, point.latitude];
}

/** Where the map opens: on the Shop pin, close enough to read street names. */
export const SHOP_CAMERA = {
  centerCoordinate: toMapCoordinate(SHOP_PIN),
  zoomLevel: 15,
};

/** The shared style, serialised once for the native map. */
export const MAP_STYLE_JSON = JSON.stringify(MAP_STYLE);

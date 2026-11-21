import { type LatLng, MAP_STYLE, SHOP_PIN } from "@courier/config";

export type MapCoordinate = [longitude: number, latitude: number];

export function toMapCoordinate(point: LatLng): MapCoordinate {
  return [point.longitude, point.latitude];
}

export const SHOP_CAMERA = {
  centerCoordinate: toMapCoordinate(SHOP_PIN),
  zoomLevel: 15,
};

export const MAP_STYLE_JSON = JSON.stringify(MAP_STYLE);

/**
 * The one map style every surface draws: a Streets-type style over Mapbox's vector
 * tiles, written against the open style spec (version 8) so a move to MapLibre (ADR
 * 0013) is a source swap, not a restyle.
 *
 * No token lives here. `mapbox://` URLs are resolved by the native SDK with the token
 * the app sets at runtime (`EXPO_PUBLIC_MAPBOX_TOKEN`).
 */
export interface MapStyle {
  readonly version: 8;
  readonly name: string;
  readonly sources: Readonly<Record<string, MapStyleValue>>;
  readonly sprite?: string;
  readonly glyphs: string;
  readonly layers: readonly MapStyleLayer[];
}

export interface MapStyleLayer {
  readonly id: string;
  readonly type: "background" | "fill" | "line" | "symbol" | "circle";
  readonly source?: string;
  readonly "source-layer"?: string;
  readonly minzoom?: number;
  readonly filter?: MapStyleValue;
  readonly layout?: Readonly<Record<string, MapStyleValue>>;
  readonly paint?: Readonly<Record<string, MapStyleValue>>;
}

/** Anything JSON can carry. Expressions are nested arrays of these. */
export type MapStyleValue =
  | string
  | number
  | boolean
  | null
  | readonly MapStyleValue[]
  | { readonly [key: string]: MapStyleValue };

const STREETS = "streets";
const FONT = ["DIN Pro Regular", "Arial Unicode MS Regular"];

const roadWidth = (base: number) => [
  "interpolate",
  ["exponential", 1.5],
  ["zoom"],
  12,
  base * 0.5,
  18,
  base * 8,
];

const road = (id: string, classes: readonly string[], color: string, width: number) => ({
  id,
  type: "line" as const,
  source: STREETS,
  "source-layer": "road",
  filter: ["match", ["get", "class"], [...classes], true, false],
  layout: { "line-cap": "round", "line-join": "round" },
  paint: { "line-color": color, "line-width": roadWidth(width) },
});

export const MAP_STYLE: MapStyle = {
  version: 8,
  name: "Courier streets",
  sources: {
    [STREETS]: { type: "vector", url: "mapbox://mapbox.mapbox-streets-v8" },
  },
  glyphs: "mapbox://fonts/mapbox/{fontstack}/{range}.pbf",
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#f4f1ea" } },
    {
      id: "park",
      type: "fill",
      source: STREETS,
      "source-layer": "landuse",
      filter: ["match", ["get", "class"], ["park", "pitch", "grass"], true, false],
      paint: { "fill-color": "#d7ead0" },
    },
    {
      id: "water",
      type: "fill",
      source: STREETS,
      "source-layer": "water",
      paint: { "fill-color": "#aad3ec" },
    },
    {
      id: "waterway",
      type: "line",
      source: STREETS,
      "source-layer": "waterway",
      paint: { "line-color": "#aad3ec", "line-width": 1.5 },
    },
    {
      id: "building",
      type: "fill",
      source: STREETS,
      "source-layer": "building",
      minzoom: 15,
      paint: { "fill-color": "#e4ded3", "fill-outline-color": "#d6cec1" },
    },
    road("road-path", ["path", "pedestrian"], "#ffffff", 0.25),
    road("road-street", ["street", "street_limited", "service"], "#ffffff", 0.75),
    road("road-secondary", ["secondary", "tertiary"], "#fffdf5", 1),
    road("road-primary", ["primary", "trunk"], "#fde9b5", 1.25),
    road("road-motorway", ["motorway"], "#f9c97a", 1.5),
    {
      id: "road-label",
      type: "symbol",
      source: STREETS,
      "source-layer": "road",
      minzoom: 14,
      layout: {
        "symbol-placement": "line",
        "text-field": ["coalesce", ["get", "name_en"], ["get", "name"]],
        "text-font": FONT,
        "text-size": 11,
      },
      paint: {
        "text-color": "#5a554c",
        "text-halo-color": "#ffffff",
        "text-halo-width": 1,
      },
    },
    {
      id: "place-label",
      type: "symbol",
      source: STREETS,
      "source-layer": "place_label",
      layout: {
        "text-field": ["coalesce", ["get", "name_en"], ["get", "name"]],
        "text-font": FONT,
        "text-size": ["interpolate", ["linear"], ["zoom"], 10, 11, 16, 15],
      },
      paint: {
        "text-color": "#3b3833",
        "text-halo-color": "#ffffff",
        "text-halo-width": 1.25,
      },
    },
  ],
};

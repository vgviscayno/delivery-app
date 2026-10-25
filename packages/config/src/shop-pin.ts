/** A point on the map, in degrees (WGS 84). */
export interface LatLng {
  readonly latitude: number;
  readonly longitude: number;
}

/**
 * The Shop pin: the one fixed point where the shop is. Drivers leave from here, and the
 * delivery radius is measured from here out to an Address's pin.
 *
 * Plain TypeScript with no runtime dependency, because the submission Edge Function
 * (Deno) imports this same constant for the radius gate.
 *
 * TODO(pre-pilot): PLACEHOLDER. This is central Manila, not the shop. Replace it with
 * the shop's surveyed coordinates before the pilot; until then the radius is measured
 * from the wrong place.
 */
export const SHOP_PIN: LatLng = {
  latitude: 14.5995,
  longitude: 120.9842,
};

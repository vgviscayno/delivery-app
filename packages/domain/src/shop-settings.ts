import type { Database } from "./generated/database.types.js";

type Functions = Database["public"]["Functions"];
type SettingsRow = Functions["shop_settings"]["Returns"][number];
type OrderingDayRow = Functions["ordering_window"]["Returns"][number];
type ClosureRow = Functions["shop_closures"]["Returns"][number];

/**
 * A wall-clock time in the shop's time zone, `HH:MM`. Postgres sends `HH:MM:SS`; no
 * setting is finer than a minute, so the seconds are dropped.
 */
export type ShopTime = string;

/** One weekday's Ordering window. ISO weekday: Monday is 1, Sunday is 7. */
export interface OrderingDay {
  readonly weekday: number;
  readonly opensAt: ShopTime;
  readonly closesAt: ShopTime;
}

/** A date the shop does not deliver on, whatever its weekday hours say. */
export interface ShopClosure {
  /** `2026-12-25`. */
  readonly closedOn: string;
  readonly note: string | null;
}

/**
 * The scalar settings the dispatcher edits as one form. `null` is a setting the business
 * has not agreed a value for yet; a rule that needs it has nothing to judge against.
 */
export interface ShopSettingsEdits {
  readonly sameDayCutoffBufferMinutes: number;
  readonly deliveryRadiusMeters: number | null;
  /** Whole centavos. */
  readonly deliveryFeeCentavos: number | null;
  /** E.164: `+639171234567`. */
  readonly shopPhone: string | null;
  readonly endOfDay: ShopTime;
  readonly darkThresholdMinutes: number;
  readonly timeConfirmationCutoff: ShopTime | null;
}

/** The shop's rules, as every surface reads them. */
export interface ShopSettings extends ShopSettingsEdits {
  /** Where the QR Ph image is in the `shop` Storage bucket. */
  readonly qrPhImagePath: string | null;
  /** Open weekdays only, Monday first. A weekday not listed is closed. */
  readonly orderingWindow: readonly OrderingDay[];
  /** From today on, soonest first. */
  readonly closures: readonly ShopClosure[];
}

export class ShopSettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShopSettingsError";
  }
}

// The generator cannot see nullability through a function's return type, so it types
// every column as present. These rows are what the server actually sends.
type Nullable<T> = { [K in keyof T]: T[K] | null };

export function toShopSettings(
  row: Nullable<SettingsRow>,
  orderingWindow: readonly OrderingDayRow[],
  closures: readonly Nullable<ClosureRow>[],
): ShopSettings {
  return {
    sameDayCutoffBufferMinutes: required(row.same_day_cutoff_buffer_minutes),
    deliveryRadiusMeters: row.delivery_radius_meters,
    deliveryFeeCentavos: row.delivery_fee_centavos,
    shopPhone: row.shop_phone,
    qrPhImagePath: row.qr_ph_image_path,
    endOfDay: toShopTime(required(row.end_of_day)),
    darkThresholdMinutes: required(row.dark_threshold_minutes),
    timeConfirmationCutoff:
      row.time_confirmation_cutoff === null
        ? null
        : toShopTime(row.time_confirmation_cutoff),
    orderingWindow: orderingWindow.map((day) => ({
      weekday: day.weekday,
      opensAt: toShopTime(day.opens_at),
      closesAt: toShopTime(day.closes_at),
    })),
    closures: closures.map((closure) => ({
      closedOn: required(closure.closed_on),
      note: closure.note,
    })),
  };
}

/** `16:00:00` → `16:00`. */
function toShopTime(time: string): ShopTime {
  return time.slice(0, 5);
}

/** The columns the schema declares `not null`. */
function required<T>(value: T | null): T {
  if (value === null)
    throw new ShopSettingsError("the server sent an empty value for a required setting");
  return value;
}

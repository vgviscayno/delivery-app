import type { Database } from "./generated/database.types.js";

type Functions = Database["public"]["Functions"];
type SettingsRow = Functions["shop_settings"]["Returns"][number];
type OrderingDayRow = Functions["ordering_window"]["Returns"][number];
type ClosureRow = Functions["shop_closures"]["Returns"][number];

export type ShopTime = string;

export interface OrderingDay {
  readonly weekday: number;
  readonly opensAt: ShopTime;
  readonly closesAt: ShopTime;
}

export interface ShopClosure {
  readonly closedOn: string;
  readonly note: string | null;
}

export interface ShopSettingsEdits {
  readonly sameDayCutoffBufferMinutes: number;
  readonly deliveryRadiusMeters: number | null;
  readonly deliveryFeeCentavos: number | null;
  readonly shopPhone: string | null;
  readonly endOfDay: ShopTime;
  readonly darkThresholdMinutes: number;
  readonly timeConfirmationCutoff: ShopTime | null;
}

export interface ShopSettings extends ShopSettingsEdits {
  readonly qrPhImagePath: string | null;
  readonly orderingWindow: readonly OrderingDay[];
  readonly closures: readonly ShopClosure[];
}

export class ShopSettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShopSettingsError";
  }
}

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

function toShopTime(time: string): ShopTime {
  return time.slice(0, 5);
}

function required<T>(value: T | null): T {
  if (value === null)
    throw new ShopSettingsError("the server sent an empty value for a required setting");
  return value;
}

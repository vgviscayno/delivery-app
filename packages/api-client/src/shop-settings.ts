import {
  type Database,
  type OrderingDay,
  type ShopSettings,
  type ShopSettingsEdits,
  toShopSettings,
} from "@courier/domain";
import { ApiError, type CourierClient } from "./client.js";

const SHOP_SETTINGS = "shop_settings";
const ORDERING_WINDOW = "ordering_window";
const SHOP_CLOSURES = "shop_closures";
const UPDATE_SHOP_SETTINGS = "update_shop_settings";
const SET_ORDERING_DAY = "set_ordering_day";
const ADD_SHOP_CLOSURE = "add_shop_closure";
const REMOVE_SHOP_CLOSURE = "remove_shop_closure";
const SET_QR_PH_IMAGE = "set_qr_ph_image";
const UPLOAD_QR_PH_IMAGE = "upload_qr_ph_image";
const SIGN_SHOP_IMAGE = "sign_shop_image";

/** Long enough to load the image on screen; nobody should be keeping these links. */
const SIGNED_LINK_SECONDS = 300;

/** The private Storage bucket the QR Ph image lives in. */
const SHOP_BUCKET = "shop";

/** What the `shop` bucket accepts, and the extension each is stored under. */
const QR_PH_IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

type Args<Name extends keyof Database["public"]["Functions"]> =
  Database["public"]["Functions"][Name]["Args"];

// The generator types every RPC argument as required and non-null, because a function
// signature does not say otherwise. These RPCs take null for a setting nobody has agreed
// yet, or a weekday with no hours.
type NullableArgs<Name extends keyof Database["public"]["Functions"]> = {
  [K in keyof Args<Name>]: Args<Name>[K] | null;
};

/**
 * Reads the shop's rules: the scalar settings, the Ordering window and the closures
 * still to come. Any signed-in account may; the three reads happen together.
 */
export async function fetchShopSettings(client: CourierClient): Promise<ShopSettings> {
  const [settings, orderingWindow, closures] = await Promise.all([
    client.rpc(SHOP_SETTINGS),
    client.rpc(ORDERING_WINDOW),
    client.rpc(SHOP_CLOSURES),
  ]);

  if (settings.error) throw new ApiError(SHOP_SETTINGS, settings.error);
  if (orderingWindow.error) throw new ApiError(ORDERING_WINDOW, orderingWindow.error);
  if (closures.error) throw new ApiError(SHOP_CLOSURES, closures.error);

  const row = settings.data?.[0];
  if (!row) {
    throw new ApiError(SHOP_SETTINGS, {
      message: "the server returned no shop settings",
    });
  }

  return toShopSettings(row, orderingWindow.data ?? [], closures.data ?? []);
}

/** Replaces every scalar setting but the QR Ph image. Active dispatchers only. */
export async function saveShopSettings(
  client: CourierClient,
  edits: ShopSettingsEdits,
): Promise<void> {
  const args: NullableArgs<typeof UPDATE_SHOP_SETTINGS> = {
    same_day_cutoff_buffer_minutes: edits.sameDayCutoffBufferMinutes,
    delivery_radius_meters: edits.deliveryRadiusMeters,
    delivery_fee_centavos: edits.deliveryFeeCentavos,
    shop_phone: edits.shopPhone,
    end_of_day: edits.endOfDay,
    dark_threshold_minutes: edits.darkThresholdMinutes,
    time_confirmation_cutoff: edits.timeConfirmationCutoff,
  };
  await call(client, UPDATE_SHOP_SETTINGS, args);
}

/**
 * Sets one weekday's hours, or closes it with `null`. ISO weekday: Monday is 1.
 * Active dispatchers only.
 */
export async function setOrderingDay(
  client: CourierClient,
  weekday: number,
  hours: Pick<OrderingDay, "opensAt" | "closesAt"> | null,
): Promise<void> {
  const args: NullableArgs<typeof SET_ORDERING_DAY> = {
    weekday,
    opens_at: hours?.opensAt ?? null,
    closes_at: hours?.closesAt ?? null,
  };
  await call(client, SET_ORDERING_DAY, args);
}

/** Closes the shop on a date, or rewrites the note of one already closed. */
export async function addShopClosure(
  client: CourierClient,
  closedOn: string,
  note: string | null,
): Promise<void> {
  const args: NullableArgs<typeof ADD_SHOP_CLOSURE> = { closed_on: closedOn, note };
  await call(client, ADD_SHOP_CLOSURE, args);
}

/** Reopens a closed date. */
export async function removeShopClosure(
  client: CourierClient,
  closedOn: string,
): Promise<void> {
  await call(client, REMOVE_SHOP_CLOSURE, { closed_on: closedOn });
}

/**
 * Uploads a new QR Ph image and makes it the one customers pay against. Returns where
 * it was stored.
 *
 * Every upload takes a fresh name, so a phone that cached the old image never shows it
 * again. The image it replaces is removed afterwards; if that removal fails the old file
 * is merely orphaned, which is no reason to report a replacement that worked as failed.
 */
export async function replaceQrPhImage(
  client: CourierClient,
  image: Blob,
): Promise<string> {
  const extension = QR_PH_IMAGE_TYPES[image.type];
  if (!extension) {
    throw new ApiError(UPLOAD_QR_PH_IMAGE, {
      message: "the QR Ph image must be a PNG, JPEG or WebP image",
    });
  }

  const bucket = client.storage.from(SHOP_BUCKET);
  const path = `qr-ph/${crypto.randomUUID()}.${extension}`;

  const upload = await bucket.upload(path, image, {
    contentType: image.type,
    upsert: false,
  });
  if (upload.error) throw new ApiError(UPLOAD_QR_PH_IMAGE, upload.error);

  const { data: replaced, error } = await client.rpc(SET_QR_PH_IMAGE, { path });
  if (error) {
    await bucket.remove([path]);
    throw new ApiError(SET_QR_PH_IMAGE, error);
  }

  if (replaced) await bucket.remove([replaced]);
  return path;
}

/**
 * A short-lived link to an image in the `shop` bucket, for showing it. The bucket is
 * private, so there is no permanent public URL.
 */
export async function signShopImage(
  client: CourierClient,
  path: string,
): Promise<string> {
  const { data, error } = await client.storage
    .from(SHOP_BUCKET)
    .createSignedUrl(path, SIGNED_LINK_SECONDS);
  if (error) throw new ApiError(SIGN_SHOP_IMAGE, error);
  return data.signedUrl;
}

async function call<Name extends keyof Database["public"]["Functions"]>(
  client: CourierClient,
  name: Name,
  args: NullableArgs<Name>,
): Promise<void> {
  const { error } = await client.rpc(name, args as Args<Name>);
  if (error) throw new ApiError(name, error);
}

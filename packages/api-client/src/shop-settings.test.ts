import { describe, expect, it, vi } from "vitest";
import { ApiError, type CourierClient } from "./client.js";
import {
  fetchShopSettings,
  replaceQrPhImage,
  saveShopSettings,
  setOrderingDay,
} from "./shop-settings.js";

type Response = { data: unknown; error: unknown };

const ok = (data: unknown): Response => ({ data, error: null });
const refused: Response = {
  data: null,
  error: {
    message: "only an active dispatcher may change the shop settings",
    code: "42501",
  },
};

const settingsRow = {
  same_day_cutoff_buffer_minutes: 30,
  delivery_radius_meters: 5000,
  delivery_fee_centavos: 5000,
  shop_phone: "+639170000000",
  qr_ph_image_path: "qr-ph/placeholder.png",
  end_of_day: "16:00:00",
  dark_threshold_minutes: 10,
  time_confirmation_cutoff: null,
  updated_at: "2026-10-25T07:00:00+00:00",
};

interface Fake {
  rpc?: Record<string, Response>;
  upload?: { error: unknown };
}

function fakeClient({ rpc = {}, upload = { error: null } }: Fake = {}) {
  const rpcFn = vi.fn((name: string) =>
    Promise.resolve(rpc[name] ?? { data: null, error: null }),
  );
  const bucket = {
    upload: vi.fn().mockResolvedValue({ data: {}, ...upload }),
    remove: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
  const storage = { from: vi.fn().mockReturnValue(bucket) };
  return {
    client: { rpc: rpcFn, storage } as unknown as CourierClient,
    rpc: rpcFn,
    storage,
    bucket,
  };
}

describe("fetchShopSettings", () => {
  it("reads the scalar settings, the Ordering window and the closures as one", async () => {
    const { client } = fakeClient({
      rpc: {
        shop_settings: ok([settingsRow]),
        ordering_window: ok([
          { weekday: 1, opens_at: "08:00:00", closes_at: "16:00:00" },
        ]),
        shop_closures: ok([{ closed_on: "2026-12-25", note: "Christmas Day" }]),
      },
    });

    await expect(fetchShopSettings(client)).resolves.toEqual({
      sameDayCutoffBufferMinutes: 30,
      deliveryRadiusMeters: 5000,
      deliveryFeeCentavos: 5000,
      shopPhone: "+639170000000",
      qrPhImagePath: "qr-ph/placeholder.png",
      endOfDay: "16:00",
      darkThresholdMinutes: 10,
      timeConfirmationCutoff: null,
      orderingWindow: [{ weekday: 1, opensAt: "08:00", closesAt: "16:00" }],
      closures: [{ closedOn: "2026-12-25", note: "Christmas Day" }],
    });
  });

  it("names the read that failed", async () => {
    const { client } = fakeClient({
      rpc: {
        shop_settings: ok([settingsRow]),
        ordering_window: { data: null, error: { message: "permission denied" } },
        shop_closures: ok([]),
      },
    });

    await expect(fetchShopSettings(client)).rejects.toThrow(/ordering_window/);
  });

  it("treats a missing settings row as a failure, not as empty settings", async () => {
    const { client } = fakeClient({
      rpc: { shop_settings: ok([]), ordering_window: ok([]), shop_closures: ok([]) },
    });

    await expect(fetchShopSettings(client)).rejects.toThrow(/no shop settings/);
  });
});

describe("saveShopSettings", () => {
  const edits = {
    sameDayCutoffBufferMinutes: 45,
    deliveryRadiusMeters: 6000,
    deliveryFeeCentavos: 7500,
    shopPhone: "+639171234567",
    endOfDay: "17:00",
    darkThresholdMinutes: 12,
    timeConfirmationCutoff: null,
  };

  it("sends every scalar setting together, unagreed ones as empty", async () => {
    const { client, rpc } = fakeClient();

    await saveShopSettings(client, edits);

    expect(rpc).toHaveBeenCalledWith("update_shop_settings", {
      same_day_cutoff_buffer_minutes: 45,
      delivery_radius_meters: 6000,
      delivery_fee_centavos: 7500,
      shop_phone: "+639171234567",
      end_of_day: "17:00",
      dark_threshold_minutes: 12,
      time_confirmation_cutoff: null,
    });
  });

  it("surfaces the server's refusal", async () => {
    const { client } = fakeClient({ rpc: { update_shop_settings: refused } });

    await expect(saveShopSettings(client, edits)).rejects.toThrow(ApiError);
  });
});

describe("setOrderingDay", () => {
  it("closes a weekday by giving it no hours", async () => {
    const { client, rpc } = fakeClient();

    await setOrderingDay(client, 6, null);

    expect(rpc).toHaveBeenCalledWith("set_ordering_day", {
      weekday: 6,
      opens_at: null,
      closes_at: null,
    });
  });
});

describe("replaceQrPhImage", () => {
  const image = new Blob(["png"], { type: "image/png" });

  it("uploads under a new name, points the settings at it, and removes the old image", async () => {
    const { client, rpc, storage, bucket } = fakeClient({
      rpc: { set_qr_ph_image: ok("qr-ph/placeholder.png") },
    });

    const path = await replaceQrPhImage(client, image);

    expect(path).toMatch(/^qr-ph\/[0-9a-f-]{36}\.png$/);
    expect(storage.from).toHaveBeenCalledWith("shop");
    expect(bucket.upload).toHaveBeenCalledWith(path, image, {
      contentType: "image/png",
      upsert: false,
    });
    expect(rpc).toHaveBeenCalledWith("set_qr_ph_image", { path });
    expect(bucket.remove).toHaveBeenCalledWith(["qr-ph/placeholder.png"]);
  });

  it("gives every upload its own name, so a replaced image is never served from cache", async () => {
    const { client } = fakeClient({ rpc: { set_qr_ph_image: ok(null) } });

    const first = await replaceQrPhImage(client, image);
    const second = await replaceQrPhImage(client, image);

    expect(first).not.toEqual(second);
  });

  it("removes nothing when there was no image before", async () => {
    const { client, bucket } = fakeClient({ rpc: { set_qr_ph_image: ok(null) } });

    await replaceQrPhImage(client, image);

    expect(bucket.remove).not.toHaveBeenCalled();
  });

  it("removes its own upload when the settings refuse to point at it", async () => {
    const { client, bucket } = fakeClient({ rpc: { set_qr_ph_image: refused } });

    await expect(replaceQrPhImage(client, image)).rejects.toThrow(/set_qr_ph_image/);
    const uploaded = bucket.upload.mock.calls[0]?.[0];
    expect(bucket.remove).toHaveBeenCalledWith([uploaded]);
  });

  it("refuses a file that is not a PNG, JPEG or WebP image before uploading", async () => {
    const { client, bucket } = fakeClient();

    await expect(
      replaceQrPhImage(client, new Blob(["%PDF"], { type: "application/pdf" })),
    ).rejects.toThrow(/PNG, JPEG or WebP/);
    expect(bucket.upload).not.toHaveBeenCalled();
  });
});

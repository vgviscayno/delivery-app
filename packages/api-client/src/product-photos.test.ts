import { describe, expect, it, vi } from "vitest";
import { ApiError, type CourierClient } from "./client.js";
import {
  productPhotoUrls,
  removeProductPhoto,
  uploadProductPhoto,
} from "./product-photos.js";

function fakeClient({ failOn }: { failOn?: string } = {}) {
  const bucket = {
    upload: vi.fn((path: string) =>
      Promise.resolve(
        failOn && path.endsWith(failOn)
          ? { data: null, error: { message: "the bucket refused it" } }
          : { data: { path }, error: null },
      ),
    ),
    remove: vi.fn().mockResolvedValue({ data: [], error: null }),
    getPublicUrl: vi.fn((path: string) => ({
      data: { publicUrl: `https://cdn.test/product-photos/${path}` },
    })),
  };
  const storage = { from: vi.fn().mockReturnValue(bucket) };
  return { client: { storage } as unknown as CourierClient, storage, bucket };
}

const large = new Blob(["large"], { type: "image/webp" });
const thumb = new Blob(["thumb"], { type: "image/webp" });

describe("uploadProductPhoto", () => {
  it("puts the photo and its thumbnail side by side under a new folder", async () => {
    const { client, storage, bucket } = fakeClient();

    const path = await uploadProductPhoto(client, { large, thumb });

    expect(path).toMatch(/^[0-9a-f-]{36}\/large\.webp$/);
    expect(storage.from).toHaveBeenCalledWith("product-photos");
    const folder = path.split("/")[0];
    expect(bucket.upload).toHaveBeenCalledWith(path, large, {
      contentType: "image/webp",
      upsert: false,
    });
    expect(bucket.upload).toHaveBeenCalledWith(`${folder}/thumb.webp`, thumb, {
      contentType: "image/webp",
      upsert: false,
    });
  });

  it("never reuses a folder", async () => {
    const { client } = fakeClient();

    const first = await uploadProductPhoto(client, { large, thumb });
    const second = await uploadProductPhoto(client, { large, thumb });

    expect(first).not.toBe(second);
  });

  it("stores a JPEG under .jpg, for browsers that cannot encode WebP", async () => {
    const { client } = fakeClient();
    const jpeg = new Blob(["large"], { type: "image/jpeg" });

    const path = await uploadProductPhoto(client, { large: jpeg, thumb: jpeg });

    expect(path).toMatch(/\/large\.jpg$/);
  });

  it("refuses anything the bucket would not take", async () => {
    const { client, bucket } = fakeClient();
    const png = new Blob(["large"], { type: "image/png" });

    await expect(uploadProductPhoto(client, { large: png, thumb: png })).rejects.toThrow(
      ApiError,
    );
    expect(bucket.upload).not.toHaveBeenCalled();
  });

  it("takes back the photo when the thumbnail fails, leaving nothing behind", async () => {
    const { client, bucket } = fakeClient({ failOn: "thumb.webp" });

    await expect(uploadProductPhoto(client, { large, thumb })).rejects.toThrow(
      "the bucket refused it",
    );

    const uploaded = bucket.upload.mock.calls.map(([path]) => path);
    expect(bucket.remove).toHaveBeenCalledWith(uploaded);
  });
});

describe("removeProductPhoto", () => {
  it("removes the photo and its thumbnail", async () => {
    const { client, bucket } = fakeClient();

    await removeProductPhoto(client, "a1b2/large.webp");

    expect(bucket.remove).toHaveBeenCalledWith(["a1b2/large.webp", "a1b2/thumb.webp"]);
  });

  it("reports a removal Storage refused", async () => {
    const { client, bucket } = fakeClient();
    bucket.remove.mockResolvedValue({ data: null, error: { message: "not allowed" } });

    await expect(removeProductPhoto(client, "a1b2/large.webp")).rejects.toThrow(ApiError);
  });
});

describe("productPhotoUrls", () => {
  it("gives the public links to the photo and its thumbnail", () => {
    const { client } = fakeClient();

    expect(productPhotoUrls(client, "a1b2/large.jpg")).toEqual({
      large: "https://cdn.test/product-photos/a1b2/large.jpg",
      thumb: "https://cdn.test/product-photos/a1b2/thumb.jpg",
    });
  });
});

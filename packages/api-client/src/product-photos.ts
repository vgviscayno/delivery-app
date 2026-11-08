import { ApiError, type CourierClient } from "./client.js";

// Storage steps, not RPCs: the names an ApiError gives when one of them fails.
const UPLOAD_PRODUCT_PHOTO_STEP = "upload_product_photo";
const REMOVE_PRODUCT_PHOTO_STEP = "remove_product_photo";

/** The public Storage bucket Product photos live in. */
const PRODUCT_PHOTOS_BUCKET = "product-photos";

/**
 * What the bucket accepts, and the extension each is stored under. WebP is what the
 * console makes; JPEG is for browsers whose canvas cannot encode WebP.
 */
const PHOTO_TYPES: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
};

/** A Product photo ready to store: the large image and its thumbnail, of one type. */
export interface ProductPhotoFiles {
  readonly large: Blob;
  readonly thumb: Blob;
}

/** The public links to a Product's photo and its thumbnail. */
export interface ProductPhotoUrls {
  readonly large: string;
  readonly thumb: string;
}

/**
 * Stores a Product photo and returns the path to give `saveProduct`.
 *
 * Both files go in a fresh folder, `<uuid>/large.<ext>` and `<uuid>/thumb.<ext>`, so a
 * cache that held an old photo never serves it again. If either upload fails, whatever
 * did upload is removed, so a failed save leaves nothing behind.
 */
export async function uploadProductPhoto(
  client: CourierClient,
  files: ProductPhotoFiles,
): Promise<string> {
  const extension = PHOTO_TYPES[files.large.type];
  if (!extension || files.thumb.type !== files.large.type) {
    throw new ApiError(UPLOAD_PRODUCT_PHOTO_STEP, {
      message: "a Product photo must be a WebP or JPEG image",
    });
  }

  const bucket = client.storage.from(PRODUCT_PHOTOS_BUCKET);
  const folder = crypto.randomUUID();
  const paths = {
    large: `${folder}/large.${extension}`,
    thumb: `${folder}/thumb.${extension}`,
  };
  const options = { contentType: files.large.type, upsert: false };

  const uploads = await Promise.all([
    bucket.upload(paths.large, files.large, options),
    bucket.upload(paths.thumb, files.thumb, options),
  ]);
  const failed = uploads.find((upload) => upload.error);
  if (failed?.error) {
    await bucket.remove([paths.large, paths.thumb]);
    throw new ApiError(UPLOAD_PRODUCT_PHOTO_STEP, failed.error);
  }

  return paths.large;
}

/**
 * Removes a Product photo and its thumbnail. Only for a photo no Product points at any
 * more: a soft-deleted Product keeps its photo for the Orders that show it.
 */
export async function removeProductPhoto(
  client: CourierClient,
  path: string,
): Promise<void> {
  const { error } = await client.storage
    .from(PRODUCT_PHOTOS_BUCKET)
    .remove([path, thumbnailPath(path)]);
  if (error) throw new ApiError(REMOVE_PRODUCT_PHOTO_STEP, error);
}

/** The public links to a stored photo. The bucket is public, so these do not expire. */
export function productPhotoUrls(client: CourierClient, path: string): ProductPhotoUrls {
  const bucket = client.storage.from(PRODUCT_PHOTOS_BUCKET);
  return {
    large: bucket.getPublicUrl(path).data.publicUrl,
    thumb: bucket.getPublicUrl(thumbnailPath(path)).data.publicUrl,
  };
}

/** `<folder>/large.<ext>` → `<folder>/thumb.<ext>`. */
function thumbnailPath(path: string): string {
  return path.replace(/large(\.[a-z]+)$/, "thumb$1");
}

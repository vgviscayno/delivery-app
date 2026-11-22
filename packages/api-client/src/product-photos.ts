import { ApiError, type CourierClient } from "./client.js";

const UPLOAD_PRODUCT_PHOTO_STEP = "upload_product_photo";
const REMOVE_PRODUCT_PHOTO_STEP = "remove_product_photo";

const PRODUCT_PHOTOS_BUCKET = "product-photos";

const PHOTO_TYPES: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
};

export interface ProductPhotoFiles {
  readonly large: Blob;
  readonly thumb: Blob;
}

export interface ProductPhotoUrls {
  readonly large: string;
  readonly thumb: string;
}

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

export async function removeProductPhoto(
  client: CourierClient,
  path: string,
): Promise<void> {
  const { error } = await client.storage
    .from(PRODUCT_PHOTOS_BUCKET)
    .remove([path, thumbnailPath(path)]);
  if (error) throw new ApiError(REMOVE_PRODUCT_PHOTO_STEP, error);
}

export function productPhotoUrls(client: CourierClient, path: string): ProductPhotoUrls {
  const bucket = client.storage.from(PRODUCT_PHOTOS_BUCKET);
  return {
    large: bucket.getPublicUrl(path).data.publicUrl,
    thumb: bucket.getPublicUrl(thumbnailPath(path)).data.publicUrl,
  };
}

function thumbnailPath(path: string): string {
  return path.replace(/large(\.[a-z]+)$/, "thumb$1");
}

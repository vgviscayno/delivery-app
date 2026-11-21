import type { ProductPhotoFiles } from "@courier/api-client";

const LARGE: Size = { width: 1600, height: 3200 };
const THUMB: Size = { width: 480, height: 960 };
const QUALITY = 0.82;

interface Size {
  readonly width: number;
  readonly height: number;
}

export function scaledSize(size: Size, box: Size): Size {
  const scale = Math.min(1, box.width / size.width, box.height / size.height);
  if (scale === 1) return size;
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
}

export async function resizePhoto(file: File): Promise<ProductPhotoFiles> {
  const image = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const type = (await encodes("image/webp")) ? "image/webp" : "image/jpeg";
    const [large, thumb] = await Promise.all([
      draw(image, scaledSize(image, LARGE), type),
      draw(image, scaledSize(image, THUMB), type),
    ]);
    return { large, thumb };
  } finally {
    image.close();
  }
}

async function draw(image: ImageBitmap, size: Size, type: string): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot resize the photo.");
  context.drawImage(image, 0, 0, size.width, size.height);
  return blobOf(canvas, type);
}

async function encodes(type: string): Promise<boolean> {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  try {
    return (await blobOf(canvas, type)).type === type;
  } catch {
    return false;
  }
}

function blobOf(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("The photo could not be encoded.")),
      type,
      QUALITY,
    );
  });
}

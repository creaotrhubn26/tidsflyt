import crypto from "node:crypto";
import path from "node:path";
import sharp from "sharp";

export type LeaveAttachmentType = {
  mimeType: "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
  extension: ".pdf" | ".jpg" | ".png" | ".webp";
};

const MAX_IMAGE_PIXELS = 25_000_000;
const SAFE_STORAGE_NAME = /^[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/i;

export function leaveAttachmentDirectory(): string {
  return path.join(process.cwd(), "private-uploads", "leave");
}

export function resolveLeaveAttachmentStoragePath(filename: unknown): string | null {
  const value = String(filename ?? "");
  if (!SAFE_STORAGE_NAME.test(value) || path.basename(value) !== value) return null;
  const directory = path.resolve(leaveAttachmentDirectory());
  const resolved = path.resolve(directory, value);
  return resolved.startsWith(`${directory}${path.sep}`) ? resolved : null;
}

function startsWith(body: Buffer, signature: number[]): boolean {
  return signature.every((value, index) => body[index] === value);
}

export function safeLeaveAttachmentName(value: unknown): string {
  const original = String(value ?? "vedlegg");
  // Busboy/Multer kan tolke UTF-8-byte i multipart filename som latin1 og
  // levere mojibake ("legeerklÃ¦ring.pdf"). Reparer bare når en latin1→UTF-8-
  // dekoding er tapsfri; ekte latin1/Unicode med ugyldig UTF-8 beholdes.
  const decoded = Buffer.from(original, "latin1").toString("utf8");
  const normalized = decoded.includes("\uFFFD") ? original : decoded;
  const base = path.basename(normalized)
    .replace(/[\r\n\0]/g, "")
    .trim()
    .slice(0, 180);
  return base || "vedlegg";
}

export function createLeaveAttachmentStorageName(type: LeaveAttachmentType): string {
  return `${crypto.randomUUID()}${type.extension}`;
}

export function leaveAttachmentContentDisposition(originalName: string): string {
  const safe = safeLeaveAttachmentName(originalName);
  const ascii = safe.replace(/[^A-Za-z0-9._-]/g, "_") || "vedlegg";
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

export async function validateLeaveAttachment(
  body: Buffer,
  declaredMimeType: unknown,
): Promise<LeaveAttachmentType> {
  const mimeType = String(declaredMimeType ?? "").toLowerCase();
  if (body.length === 0) throw new Error("EMPTY_FILE");

  if (mimeType === "application/pdf") {
    const hasHeader = body.subarray(0, 5).toString("ascii") === "%PDF-";
    const tail = body.subarray(Math.max(0, body.length - 4096)).toString("latin1");
    if (!hasHeader || !tail.includes("%%EOF")) throw new Error("INVALID_PDF");
    return { mimeType: "application/pdf", extension: ".pdf" };
  }

  const expected = mimeType === "image/jpeg"
    ? { format: "jpeg", extension: ".jpg" as const, signature: [0xff, 0xd8, 0xff] }
    : mimeType === "image/png"
      ? { format: "png", extension: ".png" as const, signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }
      : mimeType === "image/webp"
        ? { format: "webp", extension: ".webp" as const, signature: [] }
        : null;
  if (!expected) throw new Error("UNSUPPORTED_TYPE");

  const signatureMatches = mimeType === "image/webp"
    ? body.length >= 12
      && body.subarray(0, 4).toString("ascii") === "RIFF"
      && body.subarray(8, 12).toString("ascii") === "WEBP"
    : startsWith(body, expected.signature);
  if (!signatureMatches) throw new Error("SIGNATURE_MISMATCH");

  const metadata = await sharp(body, {
    failOn: "error",
    limitInputPixels: MAX_IMAGE_PIXELS,
  }).metadata();
  if (
    metadata.format !== expected.format
    || !metadata.width
    || !metadata.height
    || metadata.width * metadata.height > MAX_IMAGE_PIXELS
  ) {
    throw new Error("INVALID_IMAGE");
  }

  return {
    mimeType: mimeType as LeaveAttachmentType["mimeType"],
    extension: expected.extension,
  };
}

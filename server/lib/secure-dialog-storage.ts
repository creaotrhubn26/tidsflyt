import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { randomBytes } from "crypto";
import path from "path";

function client(): S3Client {
  return new S3Client({ region: process.env.SAK_JOURNAL_S3_REGION || "eu-central-1" });
}

function bucket(): string {
  const value = process.env.SAK_JOURNAL_S3_BUCKET;
  if (!value) throw new Error("SAK_JOURNAL_S3_BUCKET er ikke satt");
  return value;
}

export function generateSecureDialogAttachmentKey(messageId: string, originalName: string): string {
  const ext = path.extname(originalName).toLowerCase().replace(/[^a-z0-9.]/g, "");
  return `secure-dialog/${messageId}/${randomBytes(16).toString("hex")}${ext}`;
}

export async function uploadSecureDialogAttachment(
  key: string,
  body: Buffer,
  mimeType: string,
  checksumSha256: string,
): Promise<void> {
  await client().send(new PutObjectCommand({
    Bucket: bucket(),
    Key: key,
    Body: body,
    ContentType: mimeType,
    ServerSideEncryption: "AES256",
    Metadata: { checksum_sha256: checksumSha256 },
  }));
}

export async function downloadSecureDialogAttachment(key: string): Promise<Buffer> {
  const response: any = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  const chunks: Buffer[] = [];
  for await (const chunk of response.Body as AsyncIterable<Buffer>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function deleteSecureDialogAttachment(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

/**
 * server/lib/journal-attachment-storage.ts
 *
 * S3-lagring for sak-journal-vedlegg. Samme AWS-region som databasen
 * (eu-central-1) — se docs/superpowers/specs/2026-08-22-sak-journalforing-design.md
 * for hvorfor EU/EØS (ikke lokal disk, ikke Norge-spesifikt i denne runden).
 */
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { randomBytes } from "crypto";
import path from "path";

function client(): S3Client {
  return new S3Client({ region: process.env.SAK_JOURNAL_S3_REGION || "eu-central-1" });
}

function bucket(): string {
  const b = process.env.SAK_JOURNAL_S3_BUCKET;
  if (!b) throw new Error("SAK_JOURNAL_S3_BUCKET er ikke satt");
  return b;
}

/** Trygg, unik lagringsnøkkel — aldri brukerens rå filnavn i selve nøkkelen. */
export function generateAttachmentKey(journalEntryId: string, originalName: string): string {
  const ext = path.extname(originalName).toLowerCase().replace(/[^a-z0-9.]/g, "");
  const unique = randomBytes(16).toString("hex");
  return `journal/${journalEntryId}/${unique}${ext}`;
}

export async function uploadJournalAttachment(key: string, body: Buffer, mimeType: string): Promise<void> {
  await client().send(
    new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: mimeType }),
  );
}

export async function downloadJournalAttachment(key: string): Promise<Buffer> {
  const res: any = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  const chunks: Buffer[] = [];
  for await (const chunk of res.Body as AsyncIterable<Buffer>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

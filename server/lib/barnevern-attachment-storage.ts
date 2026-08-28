/**
 * server/lib/barnevern-attachment-storage.ts
 *
 * Felles vedleggslager for barnevernsvertikalen (meldings- og
 * journalvedlegg). Med BARNEVERN_S3_BUCKET satt lagres filene i
 * objektlager (norsk/EU-bøtte, krav 4/23 — region via
 * BARNEVERN_S3_REGION, default eu-central-1 som journalvedleggene);
 * ellers lokal privat disk (dev/test).
 *
 * VIKTIG for produksjon: lokal disk på Render er flyktig og deles ikke
 * mellom instanser — uten bøtte forsvinner vedlegg ved redeploy. Det
 * logges høylytt ved oppstart i produksjon uten konfigurert bøtte.
 */
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { mkdirSync, existsSync } from "fs";
import { readFile, writeFile } from "fs/promises";
import path from "path";

export type VedleggKategori = "barnevern-meldinger" | "barnevern-sak-journal";

const LOKAL_ROT = path.join(process.cwd(), "private-uploads");

function bucket(): string | null {
  return process.env.BARNEVERN_S3_BUCKET?.trim() || null;
}

let s3: S3Client | null = null;
function s3Client(): S3Client {
  if (!s3) {
    s3 = new S3Client({ region: process.env.BARNEVERN_S3_REGION || "eu-central-1" });
  }
  return s3;
}

/** Kun for tester. */
export function setS3ClientForTesting(client: S3Client | null): void {
  s3 = client;
}

if (process.env.NODE_ENV === "production" && !bucket()) {
  console.warn(
    "[barnevern-vedlegg] BARNEVERN_S3_BUCKET er ikke satt — vedlegg lagres på FLYKTIG " +
    "lokal disk og overlever ikke redeploy/flere instanser. Konfigurer norsk/EU-bøtte (krav 4/23).",
  );
}

function nokkel(kategori: VedleggKategori, filename: string): string {
  // filename genereres alltid av oss (timestamp-random.ext) — aldri brukerens.
  return `${kategori}/${filename}`;
}

function lokalSti(kategori: VedleggKategori, filename: string): string {
  const dir = path.join(LOKAL_ROT, kategori);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return path.join(dir, path.basename(filename));
}

export async function lagreVedlegg(
  kategori: VedleggKategori,
  filename: string,
  innhold: Buffer,
  mimeType: string,
): Promise<void> {
  if (bucket()) {
    await s3Client().send(new PutObjectCommand({
      Bucket: bucket()!,
      Key: nokkel(kategori, filename),
      Body: innhold,
      ContentType: mimeType,
      ServerSideEncryption: "AES256",
    }));
    return;
  }
  await writeFile(lokalSti(kategori, filename), innhold, { mode: 0o600 });
}

export async function hentVedlegg(kategori: VedleggKategori, filename: string): Promise<Buffer> {
  if (bucket()) {
    const res: any = await s3Client().send(new GetObjectCommand({
      Bucket: bucket()!,
      Key: nokkel(kategori, filename),
    }));
    const biter: Buffer[] = [];
    for await (const bit of res.Body as AsyncIterable<Buffer>) {
      biter.push(Buffer.isBuffer(bit) ? bit : Buffer.from(bit));
    }
    return Buffer.concat(biter);
  }
  return readFile(lokalSti(kategori, filename));
}

export async function vedleggFinnes(kategori: VedleggKategori, filename: string): Promise<boolean> {
  if (bucket()) {
    try {
      await s3Client().send(new HeadObjectCommand({ Bucket: bucket()!, Key: nokkel(kategori, filename) }));
      return true;
    } catch {
      return false;
    }
  }
  return existsSync(lokalSti(kategori, filename));
}

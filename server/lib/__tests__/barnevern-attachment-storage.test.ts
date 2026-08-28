/**
 * Test av felles vedleggslager: lokal roundtrip (uten bøtte) og
 * S3-vei via injisert fake-klient (med bøtte).
 */
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, rmSync } from "fs";
import path from "path";
import {
  hentVedlegg,
  lagreVedlegg,
  setS3ClientForTesting,
  vedleggFinnes,
} from "../barnevern-attachment-storage";

const LOKAL_FIL = path.join(process.cwd(), "private-uploads", "barnevern-meldinger", "test-lager.txt");

afterEach(() => {
  delete process.env.BARNEVERN_S3_BUCKET;
  setS3ClientForTesting(null);
  if (existsSync(LOKAL_FIL)) rmSync(LOKAL_FIL);
});

describe("barnevern-attachment-storage", () => {
  it("lokal disk: lagre, finnes, hent roundtrip", async () => {
    delete process.env.BARNEVERN_S3_BUCKET;
    await lagreVedlegg("barnevern-meldinger", "test-lager.txt", Buffer.from("hemmelig innhold"), "text/plain");
    expect(await vedleggFinnes("barnevern-meldinger", "test-lager.txt")).toBe(true);
    const innhold = await hentVedlegg("barnevern-meldinger", "test-lager.txt");
    expect(innhold.toString()).toBe("hemmelig innhold");
  });

  it("S3: bruker injisert klient med riktig nøkkel og kryptering", async () => {
    process.env.BARNEVERN_S3_BUCKET = "test-botte";
    const kall: any[] = [];
    const lagret = new Map<string, Buffer>();
    const fake = {
      send: async (cmd: any) => {
        kall.push(cmd);
        const navn = cmd.constructor.name;
        if (navn === "PutObjectCommand") {
          lagret.set(cmd.input.Key, cmd.input.Body);
          return {};
        }
        if (navn === "GetObjectCommand") {
          const body = lagret.get(cmd.input.Key);
          if (!body) throw new Error("NoSuchKey");
          return { Body: (async function* () { yield body; })() };
        }
        if (navn === "HeadObjectCommand") {
          if (!lagret.has(cmd.input.Key)) throw new Error("NotFound");
          return {};
        }
        throw new Error(`ukjent kommando ${navn}`);
      },
    };
    setS3ClientForTesting(fake as any);

    await lagreVedlegg("barnevern-sak-journal", "fil.pdf", Buffer.from("pdf-data"), "application/pdf");
    const put = kall[0];
    expect(put.input.Bucket).toBe("test-botte");
    expect(put.input.Key).toBe("barnevern-sak-journal/fil.pdf");
    expect(put.input.ContentType).toBe("application/pdf");
    expect(put.input.ServerSideEncryption).toBe("AES256");

    expect(await vedleggFinnes("barnevern-sak-journal", "fil.pdf")).toBe(true);
    expect(await vedleggFinnes("barnevern-sak-journal", "finnes-ikke.pdf")).toBe(false);
    const hentet = await hentVedlegg("barnevern-sak-journal", "fil.pdf");
    expect(hentet.toString()).toBe("pdf-data");
  });
});

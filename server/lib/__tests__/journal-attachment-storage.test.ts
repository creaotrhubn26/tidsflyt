import { describe, it, expect, vi, beforeEach } from "vitest";

const sendMock = vi.fn();
vi.mock("@aws-sdk/client-s3", () => {
  class PutObjectCommand { constructor(public input: any) {} }
  class GetObjectCommand { constructor(public input: any) {} }
  class S3Client {
    send(cmd: any) { return sendMock(cmd); }
  }
  return { S3Client, PutObjectCommand, GetObjectCommand };
});

describe("journal-attachment-storage", () => {
  beforeEach(() => {
    sendMock.mockReset();
    process.env.SAK_JOURNAL_S3_BUCKET = "test-bucket";
  });

  it("genererer en unik, trygg nøkkel som inkluderer journalEntryId og filtype", async () => {
    const { generateAttachmentKey } = await import("../journal-attachment-storage");
    const key = generateAttachmentKey("abc-123", "legeerklæring (kopi).pdf");
    expect(key).toMatch(/^journal\/abc-123\/[a-zA-Z0-9_-]+\.pdf$/);
  });

  it("uploadJournalAttachment sender PutObjectCommand med riktig bucket/body/content-type", async () => {
    sendMock.mockResolvedValue({});
    const { uploadJournalAttachment } = await import("../journal-attachment-storage");
    const buf = Buffer.from("test-innhold");
    await uploadJournalAttachment("journal/abc/xyz.pdf", buf, "application/pdf");

    expect(sendMock).toHaveBeenCalledTimes(1);
    const cmd = sendMock.mock.calls[0][0];
    expect(cmd.input).toMatchObject({
      Bucket: "test-bucket",
      Key: "journal/abc/xyz.pdf",
      Body: buf,
      ContentType: "application/pdf",
    });
  });

  it("downloadJournalAttachment henter og bufrer objektets bytes", async () => {
    const { Readable } = await import("stream");
    const stream = Readable.from([Buffer.from("del-1"), Buffer.from("del-2")]);
    sendMock.mockResolvedValue({ Body: stream });
    const { downloadJournalAttachment } = await import("../journal-attachment-storage");

    const result = await downloadJournalAttachment("journal/abc/xyz.pdf");
    expect(result.toString()).toBe("del-1del-2");
    const cmd = sendMock.mock.calls[0][0];
    expect(cmd.input).toMatchObject({ Bucket: "test-bucket", Key: "journal/abc/xyz.pdf" });
  });

  it("kaster en tydelig feil hvis SAK_JOURNAL_S3_BUCKET ikke er satt", async () => {
    delete process.env.SAK_JOURNAL_S3_BUCKET;
    vi.resetModules();
    const { uploadJournalAttachment } = await import("../journal-attachment-storage");
    await expect(uploadJournalAttachment("k", Buffer.from("x"), "text/plain")).rejects.toThrow(
      /SAK_JOURNAL_S3_BUCKET/,
    );
  });
});

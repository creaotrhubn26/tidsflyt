import { describe, expect, it } from "vitest";
import {
  createLeaveAttachmentStorageName,
  leaveAttachmentContentDisposition,
  resolveLeaveAttachmentStoragePath,
  safeLeaveAttachmentName,
  validateLeaveAttachment,
} from "../leave-attachment-security";

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nGQAAAAASUVORK5CYII=",
  "base64",
);

describe("leave attachment content validation", () => {
  it("accepts a structurally recognizable PDF and derives a random storage name", async () => {
    const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");
    const type = await validateLeaveAttachment(pdf, "application/pdf");
    expect(type).toEqual({ mimeType: "application/pdf", extension: ".pdf" });
    expect(createLeaveAttachmentStorageName(type)).toMatch(
      /^[0-9a-f-]{36}\.pdf$/,
    );
  });

  it("decodes raster images and rejects a MIME/signature mismatch", async () => {
    await expect(validateLeaveAttachment(ONE_PIXEL_PNG, "image/png")).resolves.toEqual({
      mimeType: "image/png",
      extension: ".png",
    });
    await expect(validateLeaveAttachment(ONE_PIXEL_PNG, "application/pdf")).rejects.toThrow(
      "INVALID_PDF",
    );
  });

  it("removes path/header control characters and emits attachment disposition", () => {
    expect(safeLeaveAttachmentName("../../sykmelding\r\nX-Evil: 1.pdf")).toBe(
      "sykmeldingX-Evil: 1.pdf",
    );
    const header = leaveAttachmentContentDisposition("legeerklæring august.pdf");
    expect(header).toContain("attachment;");
    expect(header).toContain("filename*=UTF-8''");
    expect(header).not.toContain("\r");
    expect(header).not.toContain("\n");
  });

  it("repairs UTF-8 multipart filenames decoded as latin1 without corrupting real Unicode", () => {
    expect(safeLeaveAttachmentName("legeerklÃ¦ring.pdf")).toBe("legeerklæring.pdf");
    expect(safeLeaveAttachmentName("legeerklæring.pdf")).toBe("legeerklæring.pdf");
  });

  it("resolves only random private storage names inside the leave directory", () => {
    expect(resolveLeaveAttachmentStoragePath("01234567-89ab-4def-8123-456789abcdef.pdf"))
      .toMatch(/private-uploads\/leave\/01234567-89ab-4def-8123-456789abcdef\.pdf$/);
    expect(resolveLeaveAttachmentStoragePath("../../etc/passwd")).toBeNull();
    expect(resolveLeaveAttachmentStoragePath("legacy-user-controlled.pdf")).toBeNull();
  });
});

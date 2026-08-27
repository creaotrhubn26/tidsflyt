import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import nodemailer from "nodemailer";
import puppeteer from "puppeteer";
import Quill from "quill";
import sharp from "sharp";

describe("security dependency upgrades", () => {
  it("generates email through the Nodemailer 9 transport API", async () => {
    const transporter = nodemailer.createTransport({ jsonTransport: true });
    const result = await transporter.sendMail({
      from: "noreply@example.test",
      to: "recipient@example.test",
      subject: "Dependency smoke test",
      text: "OK",
    });

    expect(result.messageId).toBeTruthy();
    expect(result.message).toBeTruthy();
  });

  it("processes an in-memory image with Sharp 0.35", async () => {
    const output = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 4,
        background: { r: 18, g: 59, b: 68, alpha: 1 },
      },
    })
      .resize(1, 1)
      .png()
      .toBuffer();

    const metadata = await sharp(output).metadata();
    expect(metadata).toMatchObject({ format: "png", width: 1, height: 1 });
  });

  it("round-trips an XLSX workbook with the safe uuid override", async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Test");
    worksheet.getCell("A1").value = "Tidum";

    const buffer = await workbook.xlsx.writeBuffer();
    const loaded = new ExcelJS.Workbook();
    await loaded.xlsx.load(buffer);

    expect(loaded.getWorksheet("Test")?.getCell("A1").value).toBe("Tidum");
  });

  it("uses the non-vulnerable Quill release selected for react-quill-new", () => {
    expect(Quill.version).toBe("2.0.2");
  });

  it("keeps the Puppeteer launch API used by the screenshot utility", async () => {
    expect(typeof puppeteer.launch).toBe("function");
    expect(await puppeteer.defaultArgs({ headless: true })).toEqual(
      expect.any(Array),
    );
  });
});

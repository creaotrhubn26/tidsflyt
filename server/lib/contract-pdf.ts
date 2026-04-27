import PDFDocument from "pdfkit";
import { renderContract } from "./contract-renderer";
import { loadPricingSettings } from "./pricing-service";
import type { SalgContractTemplate } from "@shared/schema";

export interface RenderContractPdfInput {
  template: SalgContractTemplate;
  userCount: number;
  customer: { name: string; orgNumber: string };
}

// Minimal Markdown → pdfkit-renderer for kontrakter. Støtter:
//   # H1, ## H2 (kapitteloverskrifter)
//   **bold** (inline)
//   --- (horizontal rule, signerings-skille)
//   Tomme linjer = avsnitt-skille
//   Vanlige paragrafer
// Dette er nok for vår standard-kontraktsmal — ingen lister, tabeller
// eller bilder. Hvis admin lager mer kompleks Markdown må dette utvides.

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = { top: 60, bottom: 60, left: 60, right: 60 };
const CONTENT_W = A4.width - MARGIN.left - MARGIN.right;
const PRIMARY = "#1F6B73";

export async function renderContractPdf(
  input: RenderContractPdfInput,
): Promise<Buffer> {
  const settings = await loadPricingSettings();
  const markdown = await renderContract(input);

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: MARGIN,
      info: {
        Title: `Abonnementsavtale — ${input.customer.name}`,
        Author: settings.leverandorNavn || "Creatorhub AS",
        Creator: "Tidum Salg",
        Subject: `Tidum SaaS-avtale (${input.userCount} brukere)`,
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Footer på alle sider
    let pageNum = 0;
    const totalPagesPlaceholder = "{{P}}";
    doc.on("pageAdded", () => {
      pageNum++;
      addFooter();
    });
    addFooter(); // første side

    function addFooter() {
      const y = A4.height - 40;
      doc.save();
      doc.fontSize(8).fillColor("#888888")
        .text(
          `${settings.leverandorNavn || "Creatorhub AS"} — org.nr. ${settings.leverandorOrgNr || "—"}`,
          MARGIN.left,
          y,
          { width: CONTENT_W / 2, align: "left" },
        );
      doc.text(
        `Side ${pageNum + 1}`,
        MARGIN.left + CONTENT_W / 2,
        y,
        { width: CONTENT_W / 2, align: "right" },
      );
      doc.restore();
    }

    // Render markdown linje-for-linje
    const lines = markdown.split("\n");
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (line.startsWith("# ")) {
        renderH1(doc, line.slice(2).trim());
      } else if (line.startsWith("## ")) {
        renderH2(doc, line.slice(3).trim());
      } else if (line.trim() === "---") {
        renderHR(doc);
      } else if (line.trim() === "") {
        doc.moveDown(0.4);
      } else {
        // Slå sammen påfølgende ikke-tomme linjer som ikke er headings
        const para: string[] = [line];
        while (
          i + 1 < lines.length &&
          lines[i + 1].trim() !== "" &&
          !lines[i + 1].startsWith("#") &&
          lines[i + 1].trim() !== "---"
        ) {
          i++;
          para.push(lines[i]);
        }
        renderParagraph(doc, para.join(" "));
      }
      i++;
    }

    doc.end();
  });
}

function renderH1(doc: any, text: string) {
  doc.moveDown(0.5);
  doc.fontSize(20).fillColor(PRIMARY).font("Helvetica-Bold")
    .text(text, { width: CONTENT_W });
  doc.moveDown(0.4);
  // Underline
  const y = doc.y;
  doc.save();
  doc.strokeColor(PRIMARY).lineWidth(1.5)
    .moveTo(MARGIN.left, y).lineTo(MARGIN.left + CONTENT_W, y).stroke();
  doc.restore();
  doc.moveDown(0.6);
}

function renderH2(doc: any, text: string) {
  doc.moveDown(0.5);
  doc.fontSize(13).fillColor("#15343D").font("Helvetica-Bold")
    .text(text, { width: CONTENT_W });
  doc.moveDown(0.3);
}

function renderHR(doc: any) {
  doc.moveDown(0.6);
  const y = doc.y;
  doc.save();
  doc.strokeColor("#cccccc").lineWidth(0.5)
    .moveTo(MARGIN.left, y).lineTo(MARGIN.left + CONTENT_W, y).stroke();
  doc.restore();
  doc.moveDown(0.6);
}

// Render et avsnitt med inline **bold**-støtte
function renderParagraph(doc: any, text: string) {
  doc.fontSize(10.5).fillColor("#1d2a2e").font("Helvetica");
  // Splitt på **…** og veksle font
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  parts.forEach((part, idx) => {
    const isBold = part.startsWith("**") && part.endsWith("**");
    const content = isBold ? part.slice(2, -2) : part;
    if (!content) return;
    doc.font(isBold ? "Helvetica-Bold" : "Helvetica");
    doc.text(content, {
      continued: idx < parts.length - 1,
      width: CONTENT_W,
      align: "left",
    });
  });
  doc.moveDown(0.5);
}

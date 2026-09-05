/**
 * server/lib/turnus-pdf.ts
 *
 * Renders a generated Tidum Turnus roster as a polished landscape A4 PDF:
 * branded header band, week-grouped columns, colour-coded shift chips (matching
 * the UI), weekend shading, zebra rows, a coverage row and per-employee totals,
 * and a footer. Pure layout over pdfkit — no network, no DB.
 */
import PDFDocument from "pdfkit";

export interface TurnusPdfVakt {
  ansattNavn: string | null;
  dato: string;        // YYYY-MM-DD
  kode: string;
  startTid: string;    // HH:MM
  sluttTid: string;    // HH:MM
}
export interface RenderTurnusPdfInput {
  planNavn: string;
  vakter: TurnusPdfVakt[];
}

const UKEDAGER = ["", "man", "tir", "ons", "tor", "fre", "lør", "søn"];
const isoDow = (d: string) => new Date(d + "T00:00:00").getDay() || 7;
const erHelg = (d: string) => isoDow(d) >= 6;
const kortDato = (d: string) => { const x = new Date(d + "T00:00:00"); return `${x.getDate()}.${x.getMonth() + 1}`; };
function isoUke(d: string): number {
  const x = new Date(d + "T00:00:00"); const day = x.getDay() || 7;
  x.setDate(x.getDate() + 4 - day); const ys = new Date(x.getFullYear(), 0, 1);
  return Math.ceil(((x.getTime() - ys.getTime()) / 86400000 + 1) / 7);
}
function timer(start: string, slutt: string): number {
  const [sh, sm] = start.split(":").map(Number); const [eh, em] = slutt.split(":").map(Number);
  let m = (eh * 60 + em) - (sh * 60 + sm); if (m <= 0) m += 1440; return m / 60;
}
const nkomma = (n: number) => n.toFixed(1).replace(".", ",").replace(",0", "");
const norskI = (d: Date) => `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;

const PRIMARY = "#1F6B73";
const INK = "#0F172A", MUTE = "#64748B", LINE = "#E2E8F0";
const HELG_BG = "#FFFBEB", ZEBRA = "#F8FAFC";
// Shift-code chip colours mirror the web grid (D amber, A/K sky, N violet).
function chipFarge(kode: string): { bg: string; fg: string } {
  const k = (kode || "").trim().toUpperCase()[0];
  if (k === "D") return { bg: "#FEF3C7", fg: "#92400E" };
  if (k === "A" || k === "K") return { bg: "#E0F2FE", fg: "#075985" };
  if (k === "N") return { bg: "#EDE9FE", fg: "#5B21B6" };
  return { bg: "#E2E8F0", fg: "#334155" };
}

export function renderTurnusPdf(input: RenderTurnusPdfInput): Promise<Buffer> {
  const { planNavn, vakter } = input;
  const ansatte = [...new Set(vakter.map((v) => v.ansattNavn ?? "—"))];
  const datoer = [...new Set(vakter.map((v) => v.dato))].sort();
  const cell = new Map<string, TurnusPdfVakt>();
  const dekning = new Map<string, number>();
  const sum = new Map<string, { vakter: number; timer: number }>();
  for (const v of vakter) {
    const navn = v.ansattNavn ?? "—";
    cell.set(`${navn}|${v.dato}`, v);
    dekning.set(v.dato, (dekning.get(v.dato) ?? 0) + 1);
    const s = sum.get(navn) ?? { vakter: 0, timer: 0 };
    s.vakter++; s.timer += timer(v.startTid, v.sluttTid); sum.set(navn, s);
  }
  // Week groupings (contiguous runs of the same ISO week).
  const ukeGrupper: { uke: number; fra: number; antall: number }[] = [];
  datoer.forEach((d, i) => {
    const u = isoUke(d); const last = ukeGrupper[ukeGrupper.length - 1];
    if (last && last.uke === u) last.antall++; else ukeGrupper.push({ uke: u, fra: i, antall: 1 });
  });

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4", layout: "landscape", margins: { top: 36, bottom: 44, left: 36, right: 36 },
      info: { Title: `Turnus — ${planNavn}`, Author: "Tidum Turnus", Creator: "Tidum Turnus" },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const M = 36;
    const pageW = doc.page.width - M * 2;
    const pageH = doc.page.height;
    const nameW = 116, sumW = 58;
    const gridW = pageW - nameW - sumW;
    const dayW = Math.max(15, gridW / Math.max(1, datoer.length));
    const rowH = 19;
    const weekRowH = 14, dateRowH = 22;

    // ── Branded header band ──
    function pageChrome(): number {
      doc.rect(M, 30, pageW, 40).fill(PRIMARY);
      doc.roundedRect(M + 12, 41, 18, 18, 3).fill("#FFFFFF");
      doc.fillColor(PRIMARY).font("Helvetica-Bold").fontSize(12).text("T", M + 12, 44, { width: 18, align: "center" });
      doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(15).text(`Turnus — ${planNavn}`, M + 40, 40);
      doc.fillColor("#D7EAEC").font("Helvetica").fontSize(8)
        .text(`Tidum Turnus · ${datoer.length} dager · ${ansatte.length} ansatte · generert ${norskI(new Date())}`, M + 40, 57);
      // legend (right side of band)
      let lx = M + pageW - 12;
      for (const k of ["N", "A", "D"]) {
        const c = chipFarge(k); const w = 20;
        lx -= w + 4; doc.roundedRect(lx, 44, w, 12, 3).fill(c.bg);
        doc.fillColor(c.fg).font("Helvetica-Bold").fontSize(7).text(k, lx, 46, { width: w, align: "center" });
      }
      return 82; // y where the table begins
    }

    // ── Column header (weeks + dates) ──
    function tableHeader(top: number): number {
      // week grouping row
      for (const g of ukeGrupper) {
        const gx = M + nameW + g.fra * dayW;
        doc.fillColor(MUTE).font("Helvetica-Bold").fontSize(7).text(`Uke ${g.uke}`, gx, top + 3, { width: g.antall * dayW, align: "center" });
      }
      const dTop = top + weekRowH;
      // date row
      let x = M + nameW;
      doc.font("Helvetica");
      for (const d of datoer) {
        if (erHelg(d)) doc.rect(x, dTop, dayW, dateRowH).fill(HELG_BG);
        doc.fillColor(erHelg(d) ? "#B45309" : INK).font("Helvetica-Bold").fontSize(7).text(UKEDAGER[isoDow(d)], x, dTop + 3, { width: dayW, align: "center" });
        doc.fillColor(MUTE).font("Helvetica").fontSize(6.5).text(kortDato(d), x, dTop + 12, { width: dayW, align: "center" });
        x += dayW;
      }
      doc.fillColor(INK).font("Helvetica-Bold").fontSize(7).text("Ansatt", M, dTop + 7, { width: nameW });
      doc.text("Sum", x, dTop + 7, { width: sumW, align: "right" });
      // baseline under header
      doc.moveTo(M, dTop + dateRowH).lineTo(M + pageW, dTop + dateRowH).strokeColor(PRIMARY).lineWidth(1).stroke();
      return dTop + dateRowH;
    }

    function chip(x: number, y: number, kode: string) {
      const c = chipFarge(kode); const w = Math.min(dayW - 4, 22), cx = x + (dayW - w) / 2;
      doc.roundedRect(cx, y + 4, w, 11, 2.5).fill(c.bg);
      doc.fillColor(c.fg).font("Helvetica-Bold").fontSize(7.5).text(kode, cx, y + 6, { width: w, align: "center" });
    }

    pageChrome();
    let y = tableHeader(82);

    doc.font("Helvetica").fontSize(8);
    ansatte.forEach((navn, ri) => {
      if (ri % 2 === 1) doc.rect(M, y, pageW, rowH).fill(ZEBRA);
      // weekend column tint continues down the body
      let x = M + nameW;
      for (const d of datoer) { if (erHelg(d)) doc.rect(x, y, dayW, rowH).fill(HELG_BG); x += dayW; }

      doc.fillColor(INK).font("Helvetica-Bold").fontSize(8).text(navn, M + 4, y + 6, { width: nameW - 6, ellipsis: true });
      x = M + nameW;
      for (const d of datoer) {
        const v = cell.get(`${navn}|${d}`);
        if (v) chip(x, y, v.kode);
        x += dayW;
      }
      const s = sum.get(navn) ?? { vakter: 0, timer: 0 };
      doc.fillColor(MUTE).font("Helvetica").fontSize(7).text(`${s.vakter}v · ${nkomma(s.timer)}t`, x, y + 6, { width: sumW - 2, align: "right" });
      doc.moveTo(M, y + rowH).lineTo(M + pageW, y + rowH).strokeColor(LINE).lineWidth(0.5).stroke();
      y += rowH;
      if (y > pageH - 60) { doc.addPage(); pageChrome(); y = tableHeader(82); doc.font("Helvetica").fontSize(8); }
    });

    // Coverage row
    doc.rect(M, y, pageW, rowH).fill("#F1F5F9");
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(7).text("Dekket", M + 4, y + 6, { width: nameW });
    let cx = M + nameW;
    for (const d of datoer) { doc.fillColor(MUTE).font("Helvetica").fontSize(7).text(String(dekning.get(d) ?? 0), cx, y + 6, { width: dayW, align: "center" }); cx += dayW; }

    // Footer
    doc.fillColor(MUTE).font("Helvetica").fontSize(7)
      .text("Generert av Tidum Turnus — KI-basert turnusplanlegging. Alle harde krav i arbeidsmiljøloven er kontrollert.", M, pageH - 34, { width: pageW, align: "center" });

    doc.end();
  });
}

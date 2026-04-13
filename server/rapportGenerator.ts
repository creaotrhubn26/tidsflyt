/**
 * server/rapportGenerator.ts
 * Generates branded PDF reports using pdfkit.
 */

import PDFDocument from "pdfkit";

// ── TYPES ────────────────────────────────────────────────────────────────────

interface Branding {
  primaryColor?: string;
  secondaryColor?: string;
  accentBgColor?: string;
  orgName?: string;
  logoBase64?: string | null;
  showTidumLogo?: boolean;
}

interface Tekster {
  gdprAdvarsel?: string;
  underskriftBekreftelse?: string;
  workerRolle?: string;
  lederRolle?: string;
  bunntekst?: string;
}

interface Signatur {
  slot: number;
  name: string;
  role: string;
  date: string;
  dataUri?: string;
}

interface RapportData {
  rapport: any;
  aktiviteter: any[];
  maal: any[];
}

// ── HELPERS ──────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("nb-NO", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatPeriode(from?: string | null, to?: string | null): string {
  if (!from) return "Ukjent periode";
  const f = new Date(from);
  const label = f.toLocaleDateString("nb-NO", { month: "long", year: "numeric" });
  if (!to) return label;
  const t = new Date(to);
  if (f.getMonth() === t.getMonth() && f.getFullYear() === t.getFullYear()) return label;
  return `${formatDate(from)} – ${formatDate(to)}`;
}

function formatDuration(mins: number | null | undefined): string {
  if (!mins) return "0t";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}t ${m}m` : `${h}t`;
}

function calcDuration(fra?: string | null, til?: string | null): number {
  if (!fra || !til) return 0;
  const [fh, fm] = fra.split(":").map(Number);
  const [th, tm] = til.split(":").map(Number);
  return Math.max(0, (th * 60 + tm) - (fh * 60 + fm));
}

// ── MAIN ─────────────────────────────────────────────────────────────────────

export async function generateRapportPDF(
  template: any | undefined,
  data: RapportData,
): Promise<Buffer> {
  const { rapport: r, aktiviteter, maal } = data;

  const branding: Branding = (template?.branding as Branding) ?? {};
  const tekster: Tekster = (template?.tekster as Tekster) ?? {};
  const primary = branding.primaryColor ?? "#1F6B73";
  const secondary = branding.secondaryColor ?? "#4E9A6F";
  const orgName = branding.orgName ?? "";
  const gdprText = tekster.gdprAdvarsel ?? "Rapporten følger GDPR-krav. Ingen navn, fødselsdatoer eller adresser.";
  const bunntekst = tekster.bunntekst ?? "Konfidensielt dokument";
  const workerRolle = tekster.workerRolle ?? "Miljøarbeider";
  const lederRolle = tekster.lederRolle ?? "Tiltaksleder";
  const underskriftTekst = tekster.underskriftBekreftelse ??
    "Undertegnede bekrefter at innholdet er korrekt og i henhold til gjeldende tiltak.";

  const signaturer: Signatur[] = (r.signaturer as Signatur[]) ?? [];

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 60, bottom: 60, left: 50, right: 50 },
      info: {
        Title: `Rapport – ${formatPeriode(r.periodeFrom, r.periodeTo)}`,
        Author: r.konsulent ?? "Tidum",
        Creator: "Tidum Rapport",
      },
    });

    const chunks: Uint8Array[] = [];
    doc.on("data", (chunk: Uint8Array) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageW = doc.page.width;
    const contentW = pageW - doc.page.margins.left - doc.page.margins.right;
    const left = doc.page.margins.left;

    // ── PAGE FOOTER ──────────────────────────────────────────────────────
    let pageNum = 0;
    doc.on("pageAdded", () => {
      pageNum++;
      addFooter();
    });

    function addFooter() {
      const y = doc.page.height - 35;
      doc.save();
      doc.fontSize(7).fillColor("#999999");
      doc.text(bunntekst, left, y, { width: contentW / 2, align: "left" });
      doc.text(`Side ${pageNum}`, left + contentW / 2, y, { width: contentW / 2, align: "right" });
      doc.restore();
    }

    // First page
    pageNum = 1;

    // ── HEADER BAR ───────────────────────────────────────────────────────
    doc.save();
    doc.rect(0, 0, pageW, 90).fill(primary);

    // Logo from template
    if (branding.logoBase64) {
      try {
        const logoData = branding.logoBase64.includes(",")
          ? branding.logoBase64.split(",")[1]
          : branding.logoBase64;
        const logoBuf = Buffer.from(logoData, "base64");
        doc.image(logoBuf, left, 18, { height: 30 });
      } catch {
        // skip logo on error
      }
    }

    doc.fontSize(18).fillColor("#FFFFFF").font("Helvetica-Bold");
    doc.text("Månedlig rapport", left, 22, { width: contentW });

    doc.fontSize(10).fillColor("rgba(255,255,255,0.85)").font("Helvetica");
    doc.text(formatPeriode(r.periodeFrom, r.periodeTo), left, 48, { width: contentW });
    if (orgName) {
      doc.text(orgName, left, 63, { width: contentW });
    }
    doc.restore();

    let y = 105;

    // ── GDPR NOTICE ──────────────────────────────────────────────────────
    doc.save();
    doc.roundedRect(left, y, contentW, 28, 4).fill("#FEF3C7");
    doc.fontSize(7.5).fillColor("#92400E").font("Helvetica-Bold");
    doc.text("GDPR", left + 10, y + 5);
    doc.font("Helvetica").fontSize(7).fillColor("#78350F");
    doc.text(gdprText, left + 40, y + 5, { width: contentW - 55 });
    doc.restore();
    y += 38;

    // ── SECTION HELPER ───────────────────────────────────────────────────
    function sectionHeader(title: string, icon?: string) {
      if (y > doc.page.height - 120) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      y += 8;
      doc.save();
      doc.moveTo(left, y + 12).lineTo(left + contentW, y + 12).lineWidth(0.5).strokeColor(primary).stroke();
      doc.fontSize(12).fillColor(primary).font("Helvetica-Bold");
      doc.text(`${icon ?? ""} ${title}`.trim(), left, y);
      doc.restore();
      y += 22;
    }

    function ensureSpace(needed: number) {
      if (y + needed > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        y = doc.page.margins.top;
      }
    }

    // ── 1. PROSJEKTINFORMASJON ───────────────────────────────────────────
    sectionHeader("Prosjektinformasjon");

    const infoFields: [string, string | null | undefined][] = [
      ["Konsulent", r.konsulent],
      ["Tiltak / Rolle", r.tiltak],
      ["Bedrift", r.bedrift],
      ["Oppdragsgiver", r.oppdragsgiver],
      ["Klient-referanse", r.klientRef],
      ["Tiltaksleder", r.tiltaksleder],
      ["Periode", `${formatDate(r.periodeFrom)} – ${formatDate(r.periodeTo)}`],
    ];

    const colW = contentW / 2;
    let col = 0;
    const rowY = y;
    for (const [label, value] of infoFields) {
      if (!value) continue;
      const cx = left + (col % 2) * colW;
      const cy = rowY + Math.floor(col / 2) * 28;
      ensureSpace(30);

      doc.fontSize(7).fillColor("#888888").font("Helvetica-Bold");
      doc.text(label.toUpperCase(), cx, cy, { width: colW - 10 });
      doc.fontSize(9).fillColor("#111111").font("Helvetica");
      doc.text(value, cx, cy + 10, { width: colW - 10 });

      col++;
    }
    y = rowY + Math.ceil(col / 2) * 28 + 4;

    // ── 2. INNLEDNING ────────────────────────────────────────────────────
    if (r.innledning) {
      sectionHeader("Innledning");
      doc.fontSize(9).fillColor("#333333").font("Helvetica");
      doc.text(r.innledning, left, y, { width: contentW, lineGap: 3 });
      y = doc.y + 10;
    }

    // ── 3. MÅL OG TILTAK ────────────────────────────────────────────────
    if (maal.length > 0) {
      sectionHeader("Mål og tiltak");

      for (let i = 0; i < maal.length; i++) {
        const m = maal[i];
        ensureSpace(50);

        // Number circle
        doc.save();
        doc.circle(left + 8, y + 6, 8).fill(primary);
        doc.fontSize(8).fillColor("#FFFFFF").font("Helvetica-Bold");
        doc.text(String(i + 1), left + 2, y + 2, { width: 12, align: "center" });
        doc.restore();

        // Description
        doc.fontSize(9).fillColor("#111111").font("Helvetica");
        doc.text(m.beskrivelse, left + 22, y, { width: contentW - 100 });
        const descBottom = doc.y;

        // Status badge
        const statusColors: Record<string, string> = {
          aktiv: "#3B82F6", "pågår": "#F59E0B", "fullført": "#10B981", avbrutt: "#EF4444",
        };
        const statusColor = statusColors[m.status ?? "aktiv"] ?? "#888888";
        const statusLabel = m.status ?? "aktiv";
        doc.save();
        doc.roundedRect(left + contentW - 70, y, 60, 14, 3).fill(statusColor);
        doc.fontSize(7).fillColor("#FFFFFF").font("Helvetica-Bold");
        doc.text(statusLabel, left + contentW - 68, y + 3, { width: 56, align: "center" });
        doc.restore();

        y = descBottom + 3;

        // Progress bar
        const barW = contentW - 22;
        const progress = m.fremdrift ?? 0;
        doc.save();
        doc.roundedRect(left + 22, y, barW, 6, 3).fill("#E5E7EB");
        if (progress > 0) {
          doc.roundedRect(left + 22, y, barW * (progress / 100), 6, 3).fill(secondary);
        }
        doc.restore();
        doc.fontSize(7).fillColor(primary).font("Helvetica-Bold");
        doc.text(`${progress}%`, left + 22 + barW + 4, y - 1);

        y += 14;

        if (m.kommentar) {
          doc.fontSize(8).fillColor("#666666").font("Helvetica-Oblique");
          doc.text(m.kommentar, left + 22, y, { width: contentW - 30 });
          y = doc.y + 6;
        }

        y += 4;
      }
    }

    // ── 4. AKTIVITETSLOGG ────────────────────────────────────────────────
    if (aktiviteter.length > 0) {
      sectionHeader("Aktivitetslogg");

      // Table header
      const cols = [
        { label: "DATO", w: 60 },
        { label: "TYPE", w: 75 },
        { label: "TID", w: 55 },
        { label: "VARIGHET", w: 50 },
        { label: "BESKRIVELSE", w: contentW - 300 },
        { label: "STED", w: 60 },
      ];

      ensureSpace(20);
      doc.save();
      doc.rect(left, y, contentW, 14).fill("#F3F4F6");
      let cx = left + 4;
      doc.fontSize(6.5).fillColor("#6B7280").font("Helvetica-Bold");
      for (const col of cols) {
        doc.text(col.label, cx, y + 4, { width: col.w - 4 });
        cx += col.w;
      }
      doc.restore();
      y += 16;

      // Table rows
      let totalMins = 0;
      const uniqueDays = new Set<string>();
      let meetingCount = 0;

      for (const a of aktiviteter) {
        ensureSpace(18);

        const dur = a.varighet ?? calcDuration(a.fraKl, a.tilKl);
        totalMins += dur;
        if (a.dato) uniqueDays.add(a.dato);
        if (a.type === "klientmøte") meetingCount++;

        // Alternating row bg
        const rowIdx = aktiviteter.indexOf(a);
        if (rowIdx % 2 === 0) {
          doc.save();
          doc.rect(left, y - 1, contentW, 14).fill("#FAFAFA");
          doc.restore();
        }

        cx = left + 4;
        doc.fontSize(7.5).fillColor("#333333").font("Helvetica");

        // Dato
        const datoStr = a.dato ? a.dato.substring(5).replace("-", ".") : "—";
        doc.font("Courier").text(datoStr, cx, y + 1, { width: cols[0].w - 4 });
        cx += cols[0].w;

        // Type
        doc.font("Helvetica").text(a.type ?? "—", cx, y + 1, { width: cols[1].w - 4 });
        cx += cols[1].w;

        // Tid
        const tidStr = a.fraKl && a.tilKl ? `${a.fraKl}–${a.tilKl}` : "—";
        doc.font("Courier").text(tidStr, cx, y + 1, { width: cols[2].w - 4 });
        cx += cols[2].w;

        // Varighet
        doc.font("Helvetica-Bold").fillColor(primary);
        doc.text(formatDuration(dur), cx, y + 1, { width: cols[3].w - 4 });
        cx += cols[3].w;

        // Beskrivelse
        doc.font("Helvetica").fillColor("#333333");
        doc.text(a.beskrivelse ?? "", cx, y + 1, { width: cols[4].w - 4, lineBreak: false, ellipsis: true });
        cx += cols[4].w;

        // Sted
        doc.text(a.sted ?? "—", cx, y + 1, { width: cols[5].w - 4 });

        y += 15;
      }

      // Stats summary
      y += 6;
      ensureSpace(40);
      doc.save();
      doc.roundedRect(left, y, contentW, 30, 4).fill("#F0FDF4");

      const statItems = [
        { label: "TIMER", value: formatDuration(totalMins) },
        { label: "ARBEIDSDAGER", value: String(uniqueDays.size) },
        { label: "AKTIVITETER", value: String(aktiviteter.length) },
        { label: "KLIENTMØTER", value: String(meetingCount) },
      ];
      const statW = contentW / 4;
      for (let i = 0; i < statItems.length; i++) {
        const sx = left + i * statW;
        doc.fontSize(12).fillColor(primary).font("Helvetica-Bold");
        doc.text(statItems[i].value, sx, y + 4, { width: statW, align: "center" });
        doc.fontSize(6).fillColor("#6B7280").font("Helvetica");
        doc.text(statItems[i].label, sx, y + 20, { width: statW, align: "center" });
      }
      doc.restore();
      y += 40;
    }

    // ── 5. FREMDRIFT MOT MÅL ────────────────────────────────────────────
    if (maal.length > 0) {
      sectionHeader("Fremdrift mot mål");

      for (let i = 0; i < maal.length; i++) {
        const m = maal[i];
        ensureSpace(24);

        const labelText = `Mål ${i + 1} – ${(m.beskrivelse ?? "").substring(0, 30)}${(m.beskrivelse ?? "").length > 30 ? "…" : ""}`;
        doc.fontSize(8).fillColor("#555555").font("Helvetica");
        doc.text(labelText, left, y, { width: 160 });

        const barX = left + 165;
        const barW = contentW - 210;
        const progress = m.fremdrift ?? 0;

        doc.save();
        doc.roundedRect(barX, y + 1, barW, 8, 4).fill("#E5E7EB");
        if (progress > 0) {
          doc.roundedRect(barX, y + 1, barW * (progress / 100), 8, 4).fill(primary);
        }
        doc.restore();

        doc.fontSize(8).fillColor(primary).font("Helvetica-Bold");
        doc.text(`${progress}%`, barX + barW + 6, y, { width: 30 });

        y += 18;
      }
    }

    // ── 6. AVSLUTNING ────────────────────────────────────────────────────
    if (r.avslutning) {
      sectionHeader("Oppsummering og veien videre");
      doc.fontSize(9).fillColor("#333333").font("Helvetica");
      doc.text(r.avslutning, left, y, { width: contentW, lineGap: 3 });
      y = doc.y + 10;
    }

    // ── 7. UNDERSKRIFT ───────────────────────────────────────────────────
    sectionHeader("Underskrift");
    ensureSpace(100);

    doc.fontSize(8).fillColor("#555555").font("Helvetica");
    doc.text(underskriftTekst, left, y, { width: contentW });
    y = doc.y + 16;

    const sigBoxW = (contentW - 20) / 2;
    const sigSlots = [
      { label: workerRolle, name: r.konsulent, sig: signaturer.find(s => s.slot === 1) },
      { label: lederRolle, name: r.tiltaksleder, sig: signaturer.find(s => s.slot === 2) },
    ];

    for (let i = 0; i < sigSlots.length; i++) {
      const slot = sigSlots[i];
      const sx = left + i * (sigBoxW + 20);

      doc.save();
      doc.roundedRect(sx, y, sigBoxW, 60, 4).lineWidth(0.5).strokeColor("#D1D5DB").stroke();

      doc.fontSize(7).fillColor("#888888").font("Helvetica-Bold");
      doc.text(slot.label.toUpperCase(), sx + 8, y + 6, { width: sigBoxW - 16 });

      if (slot.sig?.dataUri) {
        try {
          const sigData = slot.sig.dataUri.includes(",")
            ? slot.sig.dataUri.split(",")[1]
            : slot.sig.dataUri;
          const sigBuf = Buffer.from(sigData, "base64");
          doc.image(sigBuf, sx + 8, y + 18, { width: 80, height: 25 });
        } catch {
          // skip broken sig
        }
      }

      doc.fontSize(8).fillColor("#333333").font("Helvetica");
      doc.text(slot.name ?? "—", sx + 8, y + 44, { width: sigBoxW - 16 });

      if (slot.sig) {
        doc.fontSize(7).fillColor("#888888").font("Helvetica");
        doc.text(formatDate(slot.sig.date), sx + sigBoxW - 70, y + 44, { width: 60, align: "right" });
      }

      doc.restore();
    }

    y += 70;

    // ── FOOTER ON FIRST PAGE ─────────────────────────────────────────────
    addFooter();

    doc.end();
  });
}

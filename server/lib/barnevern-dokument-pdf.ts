/**
 * server/lib/barnevern-dokument-pdf.ts
 *
 * PDF-generering for barnevernsvedtak og -brev (krav 6-rest). Enkel,
 * nøktern brevlayout med pdfkit (samme motor som rapport-PDF-ene):
 * kommunenavn som avsender, mottakerblokk, tittel, hjemmel,
 * brødtekst, status-/godkjenningslinje og konfidensiell bunntekst.
 */
import PDFDocument from "pdfkit";

export interface DokumentPdfInput {
  kommuneNavn: string;
  saksnummer: string | null;
  dokumenttype: string;
  tittel: string;
  hjemmel: string | null;
  innhold: string;
  mottaker: { navn?: string; adresse?: string } | null;
  status: string;
  godkjentDato: Date | string | null;
  ekspedertDato: Date | string | null;
}

function dato(d: Date | string | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("nb-NO", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function lagDokumentPdf(input: DokumentPdfInput): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      bufferPages: true,
      size: "A4",
      margins: { top: 60, bottom: 70, left: 60, right: 60 },
      info: {
        Title: input.tittel,
        Author: input.kommuneNavn,
        Creator: "Tidum barnevern",
      },
    });
    const chunks: Uint8Array[] = [];
    doc.on("data", (c: Uint8Array) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const bredde = doc.page.width - 120;

    // Avsender + metadata
    doc.font("Helvetica-Bold").fontSize(13).fillColor("#12424a").text(input.kommuneNavn, { width: bredde });
    doc.font("Helvetica").fontSize(9).fillColor("#555")
      .text(`Barneverntjenesten${input.saksnummer ? `  ·  Saksnr. ${input.saksnummer}` : ""}  ·  ${dato(new Date())}`);
    doc.moveDown(1.5);

    // Mottaker
    if (input.mottaker?.navn) {
      doc.font("Helvetica").fontSize(11).fillColor("#1a1a1a").text(input.mottaker.navn);
      if (input.mottaker.adresse) doc.text(input.mottaker.adresse);
      doc.moveDown(1.5);
    }

    // Tittel + hjemmel
    doc.font("Helvetica-Bold").fontSize(15).fillColor("#1a1a1a").text(input.tittel, { width: bredde });
    if (input.hjemmel) {
      doc.font("Helvetica-Oblique").fontSize(10).fillColor("#555").text(`Hjemmel: ${input.hjemmel}`);
    }
    doc.moveDown(1);

    // Brødtekst
    doc.font("Helvetica").fontSize(11).fillColor("#1a1a1a")
      .text(input.innhold, { width: bredde, lineGap: 3 });
    doc.moveDown(2);

    // Status-/godkjenningslinje
    const statuslinje = [
      input.status === "ekspedert" ? `Ekspedert ${dato(input.ekspedertDato)}` : null,
      input.godkjentDato ? `Godkjent av barnevernsleder ${dato(input.godkjentDato)}` : null,
    ].filter(Boolean).join("  ·  ");
    if (statuslinje) {
      doc.font("Helvetica").fontSize(9).fillColor("#555").text(statuslinje);
    }

    // Bunntekst på hver side
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      doc.font("Helvetica").fontSize(8).fillColor("#888").text(
        `Konfidensielt — unntatt offentlighet (offl. § 13 jf. fvl. § 13). ${input.kommuneNavn}.`,
        60,
        doc.page.height - 50,
        { width: bredde, align: "center" },
      );
    }

    doc.end();
  });
}

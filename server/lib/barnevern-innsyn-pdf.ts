/**
 * server/lib/barnevern-innsyn-pdf.ts
 *
 * Sladdet utleverings-PDF for innsynskrav (krav 16-rest): journalen
 * gjengis kronologisk, og oppføringer som beslutningens unntak peker på
 * (journalEntryIds) maskeres FYSISK — innholdet er ikke med i PDF-en i
 * det hele tatt, kun sladdemarkør med hjemmel. Førstesiden viser
 * beslutningen og unntakslisten, slik at parten ser hva som er unntatt
 * og med hvilken hjemmel (fvl. § 19-mønsteret).
 */
import PDFDocument from "pdfkit";

export interface InnsynPdfInput {
  kommuneNavn: string;
  saksnummer: string | null;
  partNavn: string;
  beslutningStatus: string;
  beslutningBegrunnelse: string | null;
  besluttetDato: Date | string | null;
  unntak: { hjemmel: string; beskrivelse: string; journalEntryIds?: string[] }[];
  journal: { id: string; kategori: string; innhold: string; created_at: Date | string }[];
  dokumenter: { tittel: string; dokumenttype: string; status: string; created_at: Date | string }[];
}

function dato(d: Date | string | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("nb-NO", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function lagSladdetInnsynPdf(input: InnsynPdfInput): Promise<Buffer> {
  const sladdedeIds = new Set(input.unntak.flatMap((u) => u.journalEntryIds ?? []));

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      bufferPages: true,
      // Ukomprimert: gjør fysisk sladding etterprøvbar (tester og revisorer
      // kan bekrefte at unntatt tekst ikke finnes i filen i det hele tatt).
      compress: false,
      size: "A4",
      margins: { top: 60, bottom: 70, left: 60, right: 60 },
      info: { Title: `Innsynsutlevering — sak ${input.saksnummer ?? ""}`, Author: input.kommuneNavn, Creator: "Tidum barnevern" },
    });
    const chunks: Uint8Array[] = [];
    doc.on("data", (c: Uint8Array) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const bredde = doc.page.width - 120;

    doc.font("Helvetica-Bold").fontSize(15).fillColor("#12424a")
      .text(`Innsynsutlevering — sak ${input.saksnummer ?? ""}`, { width: bredde });
    doc.font("Helvetica").fontSize(10).fillColor("#555")
      .text(`${input.kommuneNavn} — barnevernstjenesten · Utlevert til ${input.partNavn} · ${dato(new Date())}`);
    doc.moveDown(1);

    doc.font("Helvetica-Bold").fontSize(11).fillColor("#1a1a1a")
      .text(`Beslutning: ${input.beslutningStatus === "delvis_innvilget" ? "delvis innvilget" : input.beslutningStatus}${input.besluttetDato ? ` (${dato(input.besluttetDato)})` : ""}`);
    if (input.beslutningBegrunnelse) {
      doc.font("Helvetica").fontSize(10).text(`Begrunnelse: ${input.beslutningBegrunnelse}`, { width: bredde });
    }
    if (input.unntak.length) {
      doc.moveDown(0.5);
      doc.font("Helvetica-Bold").fontSize(10).text("Unntatt fra innsyn:");
      for (const u of input.unntak) {
        doc.font("Helvetica").fontSize(10)
          .text(`• ${u.beskrivelse} (${u.hjemmel})`, { width: bredde, indent: 8 });
      }
    }
    doc.moveDown(1.5);

    doc.font("Helvetica-Bold").fontSize(12).fillColor("#12424a").text("Journal", { width: bredde });
    doc.moveDown(0.5);
    for (const post of input.journal) {
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#555")
        .text(`${dato(post.created_at)} · ${post.kategori}`);
      if (sladdedeIds.has(post.id)) {
        const hjemler = input.unntak
          .filter((u) => (u.journalEntryIds ?? []).includes(post.id))
          .map((u) => u.hjemmel).join(", ");
        doc.save();
        const y = doc.y;
        doc.rect(60, y, bredde, 18).fill("#1a1a1a");
        doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(9)
          .text(`SLADDET — unntatt fra innsyn (${hjemler})`, 66, y + 5);
        doc.restore();
        doc.y = y + 24;
        doc.x = 60;
      } else {
        doc.font("Helvetica").fontSize(10).fillColor("#1a1a1a")
          .text(post.innhold, { width: bredde, lineGap: 2 });
      }
      doc.moveDown(0.8);
    }

    if (input.dokumenter.length) {
      doc.moveDown(0.5);
      doc.font("Helvetica-Bold").fontSize(12).fillColor("#12424a").text("Dokumenter i saken", { width: bredde });
      for (const d of input.dokumenter) {
        doc.font("Helvetica").fontSize(10).fillColor("#1a1a1a")
          .text(`• ${dato(d.created_at)} — ${d.tittel} (${d.dokumenttype}, ${d.status})`, { width: bredde });
      }
    }

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      doc.font("Helvetica").fontSize(8).fillColor("#888").text(
        `Konfidensielt — utlevert etter innsynsbeslutning. ${input.kommuneNavn}.`,
        60, doc.page.height - 50, { width: bredde, align: "center" },
      );
    }
    doc.end();
  });
}

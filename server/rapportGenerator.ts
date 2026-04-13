/**
 * server/rapportGenerator.ts
 * Stub for PDF generation — implement with pdfkit or similar.
 */

export async function generateRapportPDF(
  template: any,
  data: { rapport: any; aktiviteter: any[]; maal: any[] },
): Promise<Buffer> {
  // TODO: implement PDF generation with pdfkit or puppeteer
  const content = JSON.stringify(data, null, 2);
  return Buffer.from(`%PDF-stub\n${content}`, "utf-8");
}

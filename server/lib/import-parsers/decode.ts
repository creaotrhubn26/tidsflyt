/**
 * Encoding- og delimiter-deteksjon for CSV-filer.
 *
 * Planday's CSV-eksport er typisk Windows-1252 med semikolon som skille —
 * andre verktøy bruker UTF-8 med komma. Vi prøver å avgjøre hva vi har uten
 * å spørre brukeren (de vet ofte ikke selv).
 */

import { parse as parseCsvSync } from 'csv-parse/sync';
import iconv from 'iconv-lite';

/**
 * Dekod buffer til streng. Prøver UTF-8 først (med BOM-stripping), faller
 * tilbake til Windows-1252 hvis UTF-8 produserer replacement-tegn (U+FFFD).
 */
export function decodeBuffer(buf: Buffer): string {
  // UTF-8 BOM (EF BB BF) — strip
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.subarray(3).toString('utf-8');
  }

  const utf8 = buf.toString('utf-8');
  if (!utf8.includes('�')) {
    return utf8;
  }

  return iconv.decode(buf, 'win1252');
}

/**
 * Heuristisk delimiter-deteksjon basert på første 5 linjer. Velger den som
 * forekommer hyppigst. Faller tilbake til komma.
 */
export function detectDelimiter(text: string): ';' | ',' | '\t' {
  const sample = text.split('\n').slice(0, 5).join('\n');
  const counts = {
    ';': (sample.match(/;/g) || []).length,
    ',': (sample.match(/,/g) || []).length,
    '\t': (sample.match(/\t/g) || []).length,
  };
  const max = Math.max(counts[';'], counts[','], counts['\t']);
  if (max === 0) return ',';
  if (counts[';'] === max) return ';';
  if (counts['\t'] === max) return '\t';
  return ',';
}

/**
 * Parse CSV-buffer til array av rader (hver rad er et objekt med kolonne-
 * navn som nøkler). Auto-detekterer encoding og delimiter.
 */
export function parseCSVBuffer(buf: Buffer): Record<string, string>[] {
  const text = decodeBuffer(buf);
  const delimiter = detectDelimiter(text);
  return parseCsvSync(text, {
    columns: true,
    delimiter,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_column_count: true,
  });
}

/**
 * Felles typer for ansatt-import.
 *
 * En kilde-spesifikk parser tar en filbuffer og returnerer ParsedRow[].
 * Hver rad har sin originale data (raw) og en normalisert versjon (parsed)
 * som matcher Tidum-feltene. Feilsjekk skjer per rad — én dårlig rad sprenger
 * ikke hele importen.
 */

export type ImportSource = 'planday' | 'visma' | 'quinyx' | 'csv';

export interface ParsedEmployee {
  externalId: string | null;     // For idempotency — Planday employeeId el.l.
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;          // Normalisert til +47XXXXXXXX hvis 8 siffer
  department: string | null;
  hiredDate: string | null;      // ISO YYYY-MM-DD
  jobTitle: string | null;       // Brukes som hint for rolle-forslag i preview
  isActive: boolean;
}

export interface ParsedRow {
  rowIndex: number;              // 0-basert
  raw: Record<string, unknown>;
  parsed: ParsedEmployee | null; // null hvis raden ikke kunne valideres
  errors: string[];
}

export interface ImportParser {
  parse(buf: Buffer, fileName: string): Promise<ParsedRow[]>;
}

/**
 * Planday-spesifikk parser.
 *
 * Planday's "Export employee data" → Excel/CSV med standard-kolonner. Vi
 * mapper til Tidum-feltene via PLANDAY_FIELDS og normaliserer telefon/dato
 * som er kjente fallgruver.
 *
 * Kolonnemappingen er case-insensitiv og dekker både engelske og norske
 * labels — Planday lokaliseres delvis til norsk.
 */

import ExcelJS from 'exceljs';
import { parseCSVBuffer } from './decode';
import type { ImportParser, ParsedRow, ParsedEmployee } from './types';

const PLANDAY_FIELDS: Array<{ keys: string[]; out: keyof ParsedEmployee }> = [
  { keys: ['Employee ID', 'EmployeeId', 'Id', 'Ansatt-id', 'AnsattId'], out: 'externalId' },
  { keys: ['Email', 'E-mail', 'Email address', 'E-post', 'Epost'], out: 'email' },
  { keys: ['First name', 'FirstName', 'Fornavn'], out: 'firstName' },
  { keys: ['Last name', 'LastName', 'Etternavn'], out: 'lastName' },
  { keys: ['Cellphone', 'Mobile', 'Mobile phone', 'Phone', 'Telefon', 'Mobil'], out: 'phone' },
  { keys: ['Department', 'Departments', 'Avdeling'], out: 'department' },
  { keys: ['Hired date', 'Hire date', 'Ansettelsesdato', 'Startdato'], out: 'hiredDate' },
  { keys: ['Job title', 'Position', 'Stilling', 'Tittel'], out: 'jobTitle' },
];

function pickField(row: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const direct = row[k];
    if (direct != null && String(direct).trim() !== '') return String(direct).trim();
  }
  // Case-insensitiv fallback
  const lcMap = new Map<string, string>();
  for (const rk of Object.keys(row)) lcMap.set(rk.toLowerCase(), rk);
  for (const k of keys) {
    const real = lcMap.get(k.toLowerCase());
    if (real) {
      const v = row[real];
      if (v != null && String(v).trim() !== '') return String(v).trim();
    }
  }
  return null;
}

function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[\s\-()]/g, '');
  if (!cleaned) return null;
  // Norsk default: legg til +47 hvis 8 siffer uten landkode
  if (/^\d{8}$/.test(cleaned)) return `+47${cleaned}`;
  if (/^00\d+$/.test(cleaned)) return `+${cleaned.slice(2)}`;
  return cleaned;
}

function normalizeDate(d: string | null): string | null {
  if (!d) return null;
  const trimmed = d.trim();
  // DD.MM.YYYY eller DD/MM/YYYY eller DD-MM-YYYY (norsk)
  const norMatch = trimmed.match(/^(\d{1,2})[./\-](\d{1,2})[./\-](\d{4})$/);
  if (norMatch) {
    const [, day, mon, year] = norMatch;
    return `${year}-${mon.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  return null;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parseRow(row: Record<string, unknown>, rowIndex: number): ParsedRow {
  const errors: string[] = [];
  const data: Partial<ParsedEmployee> = {};

  for (const fld of PLANDAY_FIELDS) {
    (data as any)[fld.out] = pickField(row, fld.keys);
  }

  data.phone = normalizePhone(data.phone ?? null);
  data.hiredDate = normalizeDate(data.hiredDate ?? null);
  data.isActive = true;

  if (!data.email) {
    errors.push('Mangler e-post');
  } else if (!isValidEmail(data.email)) {
    errors.push('Ugyldig e-post-format');
  }
  if (!data.firstName) errors.push('Mangler fornavn');
  if (!data.lastName) errors.push('Mangler etternavn');

  return {
    rowIndex,
    raw: row,
    parsed: errors.length === 0 ? (data as ParsedEmployee) : null,
    errors,
  };
}

async function parseXLSX(buf: Buffer): Promise<Record<string, string>[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) return [];

  const rows: Record<string, string>[] = [];
  let headers: string[] = [];
  ws.eachRow((row, rowIndex) => {
    const values = (row.values as any[]).slice(1);
    if (rowIndex === 1) {
      headers = values.map((v) => String(v ?? '').trim());
      return;
    }
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      const v = values[i];
      // ExcelJS gir noen ganger { text, hyperlink } eller { result } for formler — pakk ut
      let str: string;
      if (v == null) str = '';
      else if (typeof v === 'object' && 'text' in v) str = String((v as any).text ?? '');
      else if (typeof v === 'object' && 'result' in v) str = String((v as any).result ?? '');
      else str = String(v);
      obj[h] = str.trim();
    });
    rows.push(obj);
  });
  return rows;
}

export const plandayParser: ImportParser = {
  async parse(buf, fileName) {
    const isXlsx = /\.xlsx?$/i.test(fileName);
    const rows = isXlsx ? await parseXLSX(buf) : parseCSVBuffer(buf);
    return rows.map((r, i) => parseRow(r as Record<string, unknown>, i));
  },
};

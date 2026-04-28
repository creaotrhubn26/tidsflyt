/**
 * Velger riktig parser basert på kilde. For sources vi ikke har spesialisert
 * preset for ennå (visma, quinyx, generic csv), faller vi tilbake til
 * Planday-parseren — den er case-insensitiv og dekker mange vanlige
 * kolonnenavn, så manuelle CSV-filer fungerer ofte ut av boksen.
 */

import { plandayParser } from './planday';
import type { ImportParser, ImportSource } from './types';

export function getParser(source: ImportSource): ImportParser {
  switch (source) {
    case 'planday':
      return plandayParser;
    case 'visma':
    case 'quinyx':
    case 'csv':
    default:
      return plandayParser;
  }
}

export type { ImportParser, ImportSource, ParsedEmployee, ParsedRow } from './types';

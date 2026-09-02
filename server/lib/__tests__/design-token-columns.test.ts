/**
 * Whitelist for CMS design-token-/seksjonskolonner (SQL-injectionvern).
 */
import { describe, it, expect } from "vitest";
import {
  DESIGN_TOKEN_COLUMNS, SECTION_DESIGN_COLUMNS, safeColumns, snake,
} from "../design-token-columns";

describe("design-token-columns whitelist", () => {
  it("slipper gjennom kjente kolonner", () => {
    expect(safeColumns(["primary_color", "font_family"], DESIGN_TOKEN_COLUMNS))
      .toEqual(["primary_color", "font_family"]);
    expect(safeColumns(["layout", "card_style"], SECTION_DESIGN_COLUMNS))
      .toEqual(["layout", "card_style"]);
  });

  it("stopper injection-forsøk og ukjente/metadata-nøkler", () => {
    const ondsinnet = [
      "primary_color = 'x'; DROP TABLE design_tokens; --",
      "id", "updated_at", "is_active", "vendor_id",
      "(SELECT 1)", "name",
    ];
    expect(safeColumns(ondsinnet, DESIGN_TOKEN_COLUMNS)).toEqual([]);
  });

  it("snake konverterer camelCase men beskytter fortsatt via whitelist", () => {
    expect(snake("primaryColor")).toBe("primary_color");
    // Et injection-forsøk overlever ikke whitelisten etter snake-konvertering.
    expect(DESIGN_TOKEN_COLUMNS.has(snake("primaryColor"))).toBe(true);
    expect(DESIGN_TOKEN_COLUMNS.has(snake("primaryColor; DROP"))).toBe(false);
  });
});

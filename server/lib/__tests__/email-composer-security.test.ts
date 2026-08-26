import { describe, expect, it } from "vitest";
import type { Request } from "express";
import {
  canSendReportFor,
  emailActor,
  escapeEmailHtml,
  hasValidAttachmentSignature,
  normalizeEmailRecipients,
  normalizeSubject,
  normalizeTemplateVariables,
  sanitizeEmailHtml,
  validateReportPeriod,
} from "../email-composer-security";

describe("email composer security helpers", () => {
  it("derives tenant ownership only from the authenticated server identity", () => {
    const valid = { authUser: { id: "user-a", vendorId: 101, role: "Team-leder", email: "a@example.no" } } as unknown as Request;
    expect(emailActor(valid)).toMatchObject({ id: "user-a", vendorId: 101, role: "team_leder" });

    const bodyOnly = { body: { id: "attacker", vendorId: 202 } } as unknown as Request;
    expect(emailActor(bodyOnly)).toBeNull();
    const missingTenant = { authUser: { id: "user-a", role: "admin" } } as unknown as Request;
    expect(emailActor(missingTenant)).toBeNull();
  });

  it("allows ordinary users to export only themselves and tenant leaders to select a user", () => {
    const ordinary = { id: "u1", vendorId: 1, role: "miljoarbeider" };
    const leader = { id: "l1", vendorId: 1, role: "teamleder" };
    expect(canSendReportFor(ordinary, "u1")).toBe(true);
    expect(canSendReportFor(ordinary, "u2")).toBe(false);
    expect(canSendReportFor(leader, "u2")).toBe(true);
  });

  it("rejects malformed addresses and removes header line breaks", () => {
    expect(normalizeEmailRecipients("a@example.no; b@example.no, a@example.no", true)).toBe("a@example.no, b@example.no");
    expect(() => normalizeEmailRecipients("victim@example.no\r\nBcc: attacker@example.no", true)).toThrow("INVALID_EMAIL");
    expect(() => normalizeEmailRecipients("not-an-email", true)).toThrow("INVALID_EMAIL");
    expect(normalizeSubject("Status\r\nBcc: attacker@example.no", true)).toBe("Status Bcc: attacker@example.no");
  });

  it("sanitizes active HTML and unsafe links while preserving safe formatting", () => {
    const sanitized = sanitizeEmailHtml(
      '<p onclick="steal()">Hei <strong>der</strong><script>alert(1)</script></p>'
      + '<a href="javascript:alert(1)" style="color:red">farlig</a>'
      + '<a href="https://tidum.no/path" target="_blank">trygg</a><img src="https://tracker.example/pixel">',
    );
    expect(sanitized).toContain("<p>Hei <strong>der</strong></p>");
    expect(sanitized).not.toMatch(/script|onclick|javascript|style=|<img/i);
    expect(sanitized).toContain('href="https://tidum.no/path"');
    expect(sanitized).toContain('rel="noopener noreferrer"');
    expect(escapeEmailHtml('<img src=x onerror="x">')).toBe("&lt;img src=x onerror=&quot;x&quot;&gt;");
  });

  it("bounds template variables and report periods", () => {
    expect(normalizeTemplateVariables({ mottaker: "Halden", belop: 123 })).toEqual({ mottaker: "Halden", belop: "123" });
    expect(() => normalizeTemplateVariables({ "../../key": "x" })).toThrow("INVALID_INPUT");
    expect(() => normalizeTemplateVariables({ key: "x".repeat(2_001) })).toThrow("INVALID_INPUT");
    expect(validateReportPeriod("2026-08-01", "2026-08-31")).toBe(true);
    expect(validateReportPeriod("2026-08-31", "2026-08-01")).toBe(false);
    expect(validateReportPeriod("2026-02-30", "2026-03-01")).toBe(false);
  });

  it("checks attachment content signatures instead of trusting MIME alone", () => {
    expect(hasValidAttachmentSignature(Buffer.from("%PDF-1.7\n"), "application/pdf")).toBe(true);
    expect(hasValidAttachmentSignature(Buffer.from("<script>alert(1)</script>"), "application/pdf")).toBe(false);
    expect(hasValidAttachmentSignature(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png")).toBe(true);
    expect(hasValidAttachmentSignature(Buffer.from([0x00, 0x01]), "text/plain")).toBe(false);
  });
});

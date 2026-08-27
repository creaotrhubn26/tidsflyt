import { describe, expect, it } from "vitest";
import type { Request } from "express";
import { resolveExportScope } from "../../routes/export-routes";
import { escapeExportHtml, spreadsheetSafe } from "../export-service";
import { generateInvoicePdf } from "../../routes/invoice-routes";

function requestFor(user: Record<string, unknown>): Request {
  return { authUser: user } as unknown as Request;
}

describe("tenant-aware export scope", () => {
  it("defaults every role to the authenticated user's own rows", () => {
    expect(resolveExportScope(requestFor({ id: "user-a", role: "user", vendorId: 10 }))).toEqual({
      ok: true,
      vendorId: 10,
      userId: "user-a",
    });
    expect(resolveExportScope(requestFor({ id: "leader-a", role: "teamleder", vendorId: 10 }))).toEqual({
      ok: true,
      vendorId: 10,
      userId: "leader-a",
    });
  });

  it("rejects another user and all rows for an ordinary employee", () => {
    const req = requestFor({ id: "user-a", role: "miljoarbeider", vendorId: 10 });
    expect(resolveExportScope(req, "user-b")).toMatchObject({ ok: false, status: 403 });
    expect(resolveExportScope(req, "all")).toMatchObject({ ok: false, status: 403 });
  });

  it("always adds vendor scope to a leader's targeted or all-user export", () => {
    const req = requestFor({ id: "leader-a", role: "teamleder", vendorId: 10 });
    expect(resolveExportScope(req, "user-b")).toEqual({ ok: true, vendorId: 10, userId: "user-b" });
    expect(resolveExportScope(req, "all")).toEqual({ ok: true, vendorId: 10 });
  });

  it("does not grant an unscoped all-user export to super_admin without vendor_id", () => {
    const req = requestFor({ id: "root", role: "super_admin" });
    expect(resolveExportScope(req, "all")).toMatchObject({ ok: false, status: 403 });
    expect(resolveExportScope(req)).toMatchObject({ ok: false, status: 403 });
  });
});

describe("safe export rendering", () => {
  it("neutralizes common spreadsheet formula prefixes", () => {
    expect(spreadsheetSafe("=WEBSERVICE(\"https://example.test\")")).toBe("'=WEBSERVICE(\"https://example.test\")");
    expect(spreadsheetSafe(" +SUM(1,2)")).toBe("' +SUM(1,2)");
    expect(spreadsheetSafe("\n=1+1")).toBe("'\n=1+1");
    expect(spreadsheetSafe("normal tekst")).toBe("normal tekst");
  });

  it("escapes attacker-controlled HTML fields", () => {
    expect(escapeExportHtml(`<img src=x onerror="alert(1)">&'`)).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;",
    );
  });
});

describe("invoice PDF", () => {
  it("produces a real PDF document", async () => {
    const pdf = await generateInvoicePdf(
      {
        invoiceNumber: "INV-TEST-1",
        invoiceDate: "2026-08-26",
        dueDate: "2026-09-09",
        periodStart: "2026-08-01",
        periodEnd: "2026-08-31",
        clientName: "Halden kommune",
        clientOrgNumber: "959 159 092",
        subtotal: "1000.00",
        taxRate: "25.00",
        taxAmount: "250.00",
        totalAmount: "1250.00",
        notes: "Test",
      },
      [{ description: "Systemleveranse", quantity: "1.00", unitPrice: "1000.00", amount: "1000.00" }],
    );

    expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1_000);
  });
});

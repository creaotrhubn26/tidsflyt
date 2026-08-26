import { afterEach, describe, expect, it, vi } from "vitest";
import { EmailService } from "../email-service";

describe("email service SMTP outcome contract", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.SECURE_PORTAL_URL;
  });

  function rejectingService() {
    const service = new EmailService();
    (service as any).isConfigured = true;
    (service as any).transporter = {
      sendMail: vi.fn().mockRejectedValue(new Error("ambiguous smtp failure")),
    };
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    return service;
  }

  it("preserves the legacy false outcome for ordinary callers", async () => {
    const service = rejectingService();
    await expect(service.sendEmail({ purpose: "administrative", to: "a@example.no", subject: "Test" })).resolves.toBe(false);
  });

  it("propagates an ambiguous SMTP failure when the scheduler requests it", async () => {
    const service = rejectingService();
    await expect(service.sendEmail({
      purpose: "administrative",
      to: "a@example.no",
      subject: "Test",
      throwOnError: true,
    })).rejects.toThrow("ambiguous smtp failure");
  });

  it("fails closed before SMTP for sensitive or unclassified content", async () => {
    const service = rejectingService();
    const sendMail = (service as any).transporter.sendMail;

    await expect(service.sendEmail({
      purpose: "sensitive_case_content",
      to: "a@example.no",
      subject: "Saksdokument",
      attachments: [{ filename: "sak.pdf", content: Buffer.from("sensitive") }],
    })).rejects.toMatchObject({ code: "SECURE_CHANNEL_REQUIRED" });

    await expect(service.sendEmail({
      to: "a@example.no",
      subject: "Uklassifisert",
    } as any)).rejects.toMatchObject({ code: "SECURE_CHANNEL_REQUIRED" });
    await expect(service.sendEmail({
      purpose: "neutral_secure_notification",
      to: "a@example.no",
      subject: "Forged neutral notification",
      text: "Arbitrary content",
    } as any)).rejects.toMatchObject({ code: "SECURE_CHANNEL_REQUIRED" });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("builds the secure-portal SMTP notice without case metadata or attachments", async () => {
    process.env.SECURE_PORTAL_URL = "https://portal.example.no";
    const service = new EmailService();
    const sendMail = vi.fn().mockResolvedValue({ messageId: "neutral-1" });
    (service as any).isConfigured = true;
    (service as any).transporter = { sendMail };

    await expect(service.sendSecurePortalNotification("part@example.no")).resolves.toBe(true);
    expect(sendMail).toHaveBeenCalledTimes(1);
    const delivered = sendMail.mock.calls[0][0];
    expect(delivered.subject).toBe("Ny melding i sikker portal");
    expect(delivered.text).toContain("https://portal.example.no/innbygger");
    expect(delivered.attachments).toBeUndefined();
    expect(`${delivered.subject} ${delivered.html} ${delivered.text}`).not.toMatch(/saksnummer|barn|vedtak|rapport/i);
  });
});

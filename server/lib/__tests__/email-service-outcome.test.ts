import { afterEach, describe, expect, it, vi } from "vitest";
import { EmailService } from "../email-service";

describe("email service SMTP outcome contract", () => {
  afterEach(() => vi.restoreAllMocks());

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
    await expect(service.sendEmail({ to: "a@example.no", subject: "Test" })).resolves.toBe(false);
  });

  it("propagates an ambiguous SMTP failure when the scheduler requests it", async () => {
    const service = rejectingService();
    await expect(service.sendEmail({
      to: "a@example.no",
      subject: "Test",
      throwOnError: true,
    })).rejects.toThrow("ambiguous smtp failure");
  });
});

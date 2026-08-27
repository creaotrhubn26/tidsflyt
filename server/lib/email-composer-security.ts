import type { Request } from "express";
import { load as cheerioLoad } from "cheerio";

export const EMAIL_LEADER_ROLES = new Set([
  "vendor_admin",
  "tiltaksleder",
  "teamleder",
  "hovedadmin",
  "admin",
  "super_admin",
]);

export type EmailActor = {
  id: string;
  vendorId: number;
  role: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
};

export function normalizeEmailRole(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/[\s-]/g, "_");
}

export function emailActor(req: Request): EmailActor | null {
  const identity = (req as any).authUser ?? (req as any).user ?? (req as any).admin;
  const id = String(identity?.id ?? "").trim();
  const vendorId = Number(identity?.vendorId ?? identity?.vendor_id);
  if (!id || !Number.isInteger(vendorId) || vendorId <= 0) return null;
  return {
    id,
    vendorId,
    role: normalizeEmailRole(identity?.role),
    email: typeof identity?.email === "string" ? identity.email : undefined,
    firstName: typeof identity?.firstName === "string" ? identity.firstName : undefined,
    lastName: typeof identity?.lastName === "string" ? identity.lastName : undefined,
    name: typeof identity?.name === "string" ? identity.name : undefined,
  };
}

export function canSendReportFor(actor: EmailActor, targetUserId: string): boolean {
  return targetUserId === actor.id || EMAIL_LEADER_ROLES.has(actor.role);
}

export function boundedText(value: unknown, maxLength: number, required = false): string | null {
  if (value == null || value === "") {
    if (required) throw new Error("INVALID_INPUT");
    return null;
  }
  if (typeof value !== "string") throw new Error("INVALID_INPUT");
  const text = value.trim();
  if ((required && !text) || text.length > maxLength) throw new Error("INVALID_INPUT");
  return text || null;
}

export function normalizeEmailRecipients(value: unknown, required = false): string | null {
  const text = boundedText(value, 2_000, required);
  if (!text) return null;
  const addresses = [...new Set(text.split(/[;,]/).map((item) => item.trim()).filter(Boolean))];
  if (addresses.length === 0 || addresses.length > 20) throw new Error("INVALID_EMAIL");
  const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
  if (addresses.some((address) => address.length > 320 || !emailPattern.test(address))) {
    throw new Error("INVALID_EMAIL");
  }
  return addresses.join(", ");
}

export function normalizeSubject(value: unknown, required = true): string | null {
  const subject = boundedText(value, 300, required);
  return subject ? subject.replace(/[\r\n]+/g, " ") : null;
}

export function normalizeTemplateVariables(value: unknown): Record<string, string> {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_INPUT");
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 30) throw new Error("INVALID_INPUT");
  const normalized: Record<string, string> = {};
  let totalLength = 0;
  for (const [key, raw] of entries) {
    if (!/^\w{1,64}$/.test(key) || (typeof raw !== "string" && typeof raw !== "number")) {
      throw new Error("INVALID_INPUT");
    }
    const text = String(raw);
    if (text.length > 2_000) throw new Error("INVALID_INPUT");
    totalLength += text.length;
    if (totalLength > 20_000) throw new Error("INVALID_INPUT");
    normalized[key] = text;
  }
  return normalized;
}

export function escapeEmailHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const ALLOWED_EMAIL_TAGS = new Set([
  "p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li",
  "blockquote", "h1", "h2", "h3", "h4", "span", "div", "a",
]);

export function sanitizeEmailHtml(value: unknown): string {
  const html = typeof value === "string" ? value.slice(0, 100_000) : "";
  const $ = cheerioLoad(html, {}, false);
  $("script,style,iframe,object,embed,form,input,button,img,svg,math,link,meta").remove();
  $("*").each((_index, element) => {
    const tag = String((element as any).tagName ?? (element as any).name ?? "").toLowerCase();
    if (!ALLOWED_EMAIL_TAGS.has(tag)) {
      $(element).replaceWith($(element).contents());
      return;
    }

    const attributes = { ...((element as any).attribs ?? {}) } as Record<string, string>;
    for (const name of Object.keys(attributes)) $(element).removeAttr(name);
    if (tag !== "a") return;

    const href = attributes.href?.trim();
    if (href && /^(https?:|mailto:)/i.test(href)) {
      $(element).attr("href", href).attr("rel", "noopener noreferrer");
    }
    if (attributes.title) $(element).attr("title", attributes.title.slice(0, 300));
  });
  return $.root().html() ?? "";
}

export function emailHtmlToText(value: unknown): string {
  const $ = cheerioLoad(sanitizeEmailHtml(value), {}, false);
  return $.root().text().replace(/\s+\n/g, "\n").trim();
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateReportPeriod(startDate: unknown, endDate: unknown): boolean {
  if (!isIsoDate(startDate) || !isIsoDate(endDate) || startDate > endDate) return false;
  const days = (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000;
  return days <= 366;
}

const ATTACHMENT_MIME_EXTENSIONS: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "text/plain": ".txt",
  "text/csv": ".csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
};

export function attachmentExtension(mimeType: string): string | null {
  return ATTACHMENT_MIME_EXTENSIONS[mimeType] ?? null;
}

export function hasValidAttachmentSignature(buffer: Buffer, mimeType: string): boolean {
  if (buffer.length === 0 || buffer.length > 10 * 1024 * 1024) return false;
  if (mimeType === "application/pdf") return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  if (mimeType === "image/jpeg") return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === "image/webp") return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  if (mimeType === "image/gif") return ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"));
  if (mimeType === "text/plain" || mimeType === "text/csv") return !buffer.includes(0);
  if (mimeType.includes("openxmlformats-officedocument")) {
    return buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
  }
  return false;
}

export function safeAttachmentName(value: unknown): string {
  const raw = String(value ?? "vedlegg").split(/[\\/]/).pop() ?? "vedlegg";
  const safe = raw.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 200);
  return safe || "vedlegg";
}

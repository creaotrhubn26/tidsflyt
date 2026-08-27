import { createHash } from "crypto";
import type { ArchiveDocumentFile } from "./noark";

export type SecureDialogPackageMessage = {
  id: string;
  senderKind: "staff" | "party";
  sentAt: string;
  content: string;
};

export type SecureDialogPackageAttachment = {
  id: string;
  messageId: string;
  originalName: string;
  mimeType: string;
  checksumSha256: string;
  content: Buffer;
};

export type SecureDialogPackageAuditEvent = {
  id: string;
  action: string;
  actorKind: string;
  messageId: string | null;
  attachmentId: string | null;
  createdAt: string;
};

export type SecureDialogArchiveManifest = {
  schemaVersion: 1;
  sourceSystem: "Tidum";
  conversationId: string;
  kommuneId: number;
  barnevernMeldingId: string;
  meldingsnummer: string;
  closedAt: string;
  subjectSha256: string;
  messages: Array<{
    id: string;
    senderKind: string;
    sentAt: string;
    contentSha256: string;
  }>;
  documents: Array<{
    logicalType: "transcript" | "attachment";
    sourceId: string;
    messageId?: string;
    filename: string;
    mimeType: string;
    checksumSha256: string;
  }>;
  auditEventCount: number;
  auditTrailSha256: string;
};

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeFileName(value: string): string {
  const safe = value.replace(/[^a-zA-Z0-9åæøÅÆØ._-]+/g, "_").replace(/^\.+/, "");
  return safe.slice(0, 180) || "vedlegg";
}

export function buildSecureDialogArchivePackage(input: {
  conversationId: string;
  kommuneId: number;
  barnevernMeldingId: string;
  meldingsnummer: string;
  subject: string;
  closedAt: string;
  messages: SecureDialogPackageMessage[];
  attachments: SecureDialogPackageAttachment[];
  auditEvents: SecureDialogPackageAuditEvent[];
}): { files: ArchiveDocumentFile[]; manifest: SecureDialogArchiveManifest; payloadHash: string } {
  const messages = [...input.messages].sort((a, b) => (
    a.sentAt.localeCompare(b.sentAt) || a.id.localeCompare(b.id)
  ));
  const attachments = [...input.attachments].sort((a, b) => (
    a.messageId.localeCompare(b.messageId) || a.id.localeCompare(b.id)
  ));
  const auditEvents = [...input.auditEvents].sort((a, b) => (
    a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
  ));

  const transcriptLines = [
    "Sikker dialog",
    `Meldingsnummer: ${input.meldingsnummer}`,
    `Avsluttet: ${input.closedAt}`,
    `Emne: ${input.subject}`,
    "",
  ];
  for (const message of messages) {
    transcriptLines.push(
      `[${message.sentAt}] ${message.senderKind === "staff" ? "Barnevernstjenesten" : "Innbygger"}`,
      message.content,
      "",
    );
  }
  const transcript = Buffer.from(transcriptLines.join("\n"), "utf8");
  const stem = safeFileName(`sikker-dialog-${input.meldingsnummer}`);
  const transcriptName = `${stem}.txt`;

  const documents: SecureDialogArchiveManifest["documents"] = [{
    logicalType: "transcript",
    sourceId: input.conversationId,
    filename: transcriptName,
    mimeType: "text/plain",
    checksumSha256: sha256(transcript),
  }];
  const attachmentFiles: ArchiveDocumentFile[] = attachments.map((attachment) => {
    const filename = safeFileName(`${attachment.messageId.slice(0, 8)}-${attachment.originalName}`);
    documents.push({
      logicalType: "attachment",
      sourceId: attachment.id,
      messageId: attachment.messageId,
      filename,
      mimeType: attachment.mimeType,
      checksumSha256: attachment.checksumSha256,
    });
    return {
      filename,
      mimeType: attachment.mimeType,
      content: attachment.content,
      variantformat: attachment.mimeType === "application/pdf" ? "Arkivformat" : "Produksjonsformat",
    };
  });

  const auditProjection = auditEvents.map((event) => ({
    id: event.id,
    action: event.action,
    actorKind: event.actorKind,
    messageId: event.messageId,
    attachmentId: event.attachmentId,
    createdAt: event.createdAt,
  }));
  const manifest: SecureDialogArchiveManifest = {
    schemaVersion: 1,
    sourceSystem: "Tidum",
    conversationId: input.conversationId,
    kommuneId: input.kommuneId,
    barnevernMeldingId: input.barnevernMeldingId,
    meldingsnummer: input.meldingsnummer,
    closedAt: input.closedAt,
    subjectSha256: sha256(input.subject),
    messages: messages.map((message) => ({
      id: message.id,
      senderKind: message.senderKind,
      sentAt: message.sentAt,
      contentSha256: sha256(message.content),
    })),
    documents,
    auditEventCount: auditProjection.length,
    auditTrailSha256: sha256(JSON.stringify(auditProjection)),
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2), "utf8");
  const manifestFile: ArchiveDocumentFile = {
    filename: `${stem}-manifest.json`,
    mimeType: "application/json",
    content: manifestBytes,
    variantformat: "Produksjonsformat",
  };
  const transcriptFile: ArchiveDocumentFile = {
    filename: transcriptName,
    mimeType: "text/plain",
    content: transcript,
    variantformat: "Produksjonsformat",
  };

  return {
    files: [manifestFile, transcriptFile, ...attachmentFiles],
    manifest,
    payloadHash: sha256(manifestBytes),
  };
}

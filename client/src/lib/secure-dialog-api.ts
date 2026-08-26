export type SecurePartyRole = "forelder" | "barn" | "verge" | "fullmektig";

export type SecureParty = {
  id: string;
  displayName: string;
  notificationEmail: string | null;
  status: "active" | "revoked";
  eidLinked: boolean;
  createdAt: string;
  access: {
    id: string;
    partyRole: SecurePartyRole;
    validFrom: string;
    validUntil: string | null;
  } | null;
};

export type SecureConversationSummary = {
  id: string;
  kommune_id: number;
  barnevern_melding_id: string;
  subject: string;
  status: "open" | "closed";
  created_at: string;
  updated_at: string;
};

export type SecureAttachment = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
};

export type SecureMessage = {
  id: string;
  senderUserId: string;
  senderPartyId: string | null;
  senderKind: "staff" | "party";
  content: string;
  status: "draft" | "sent";
  sentAt: string | null;
  createdAt: string;
  attachments: SecureAttachment[];
};

export type SecureConversation = {
  id: string;
  meldingId: string;
  subject: string;
  status: "open" | "closed";
  participants: Array<{ id: string; displayName: string; partyRole: SecurePartyRole }>;
  messages: SecureMessage[];
};

export type BarnevernMelding = {
  id: string;
  meldingsnummer: string;
  barnNavn: string | null;
  status: string;
  mottattDato: string;
};

export class SecureDialogApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(message);
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "include", ...init });
  const body = await response.json().catch(() => null) as { error?: unknown; code?: unknown } | null;
  if (!response.ok) {
    throw new SecureDialogApiError(
      typeof body?.error === "string" ? body.error : "Operasjonen kunne ikke fullføres",
      response.status,
      typeof body?.code === "string" ? body.code : null,
    );
  }
  return body as T;
}

function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export function listBarnevernMeldinger(): Promise<BarnevernMelding[]> {
  return requestJson("/api/barnevern/meldinger");
}

export function listSecureParties(meldingId?: string): Promise<SecureParty[]> {
  const query = meldingId ? `?meldingId=${encodeURIComponent(meldingId)}` : "";
  return requestJson(`/api/secure-dialog/parties${query}`);
}

export function createSecureParty(input: {
  displayName: string;
  personnummer: string;
  notificationEmail?: string | null;
}): Promise<{ id: string }> {
  return requestJson("/api/secure-dialog/parties", jsonInit("POST", input));
}

export function grantSecureCaseAccess(
  meldingId: string,
  input: { partyId: string; partyRole: SecurePartyRole },
): Promise<{ id: string }> {
  return requestJson(
    `/api/secure-dialog/cases/${encodeURIComponent(meldingId)}/access`,
    jsonInit("POST", input),
  );
}

export function listSecureConversations(meldingId?: string): Promise<SecureConversationSummary[]> {
  const query = meldingId ? `?meldingId=${encodeURIComponent(meldingId)}` : "";
  return requestJson(`/api/secure-dialog/conversations${query}`);
}

export function getSecureConversation(conversationId: string): Promise<SecureConversation> {
  return requestJson(`/api/secure-dialog/conversations/${encodeURIComponent(conversationId)}`);
}

export function createSecureConversation(input: {
  meldingId: string;
  subject: string;
  participantPartyIds: string[];
}): Promise<{ id: string; subject: string; status: "open" | "closed" }> {
  return requestJson("/api/secure-dialog/conversations", jsonInit("POST", input));
}

export async function sendSecureMessage(
  conversationId: string,
  content: string,
  attachment?: File | null,
): Promise<{ id: string; status: "sent" }> {
  const draft = await requestJson<{ id: string }>(
    `/api/secure-dialog/conversations/${encodeURIComponent(conversationId)}/drafts`,
    jsonInit("POST", { content }),
  );
  if (attachment) {
    const form = new FormData();
    form.append("file", attachment);
    await requestJson(
      `/api/secure-dialog/messages/${encodeURIComponent(draft.id)}/attachments`,
      { method: "POST", body: form },
    );
  }
  return requestJson(
    `/api/secure-dialog/messages/${encodeURIComponent(draft.id)}/send`,
    jsonInit("POST", {}),
  );
}

export function secureAttachmentUrl(conversationId: string, attachmentId: string): string {
  return `/api/secure-dialog/conversations/${encodeURIComponent(conversationId)}/attachments/${encodeURIComponent(attachmentId)}`;
}

import { isSecretBoxConfigured, openSecret, sealSecret } from "./secret-box";

function requireSecureDialogEncryption(): void {
  if (!isSecretBoxConfigured()) {
    throw new Error("SECURE_DIALOG_ENCRYPTION_NOT_CONFIGURED");
  }
}

export function sealSecureDialogContent(content: string): string {
  requireSecureDialogEncryption();
  return sealSecret(content);
}

export function openSecureDialogContent(stored: string): string {
  requireSecureDialogEncryption();
  return openSecret(stored);
}

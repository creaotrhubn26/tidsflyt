import type { Request } from "express";

type TidumAccessRequestSyncPayload = {
  requestId: number;
  fullName: string;
  email: string;
  orgNumber: string | null;
  company: string | null;
  phone: string | null;
  message: string | null;
  brregVerified: boolean | null;
  institutionType: string | null;
  status: string;
  vendorId: number | null;
  approvalRole?: string | null;
  reviewedBy: string | null;
  reviewedAt: string | Date | null;
  createdAt: string | Date | null;
  updatedAt: string | Date | null;
};

const CREATORHUB_SYNC_WEBHOOK_URL =
  process.env.CREATORHUB_SYNC_WEBHOOK_URL?.trim() || "";
const TIDUM_CREATORHUB_SYNC_SECRET =
  process.env.TIDUM_CREATORHUB_SYNC_SECRET?.trim() || "";

function normalizeDateValue(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function hasValidCreatorhubSyncSecret(req: Request) {
  if (!TIDUM_CREATORHUB_SYNC_SECRET) {
    return false;
  }

  const providedSecret = req.header("x-tidum-sync-secret")?.trim();
  return Boolean(providedSecret && providedSecret === TIDUM_CREATORHUB_SYNC_SECRET);
}

export async function syncTidumAccessRequestToCreatorhub(
  payload: TidumAccessRequestSyncPayload,
) {
  if (!CREATORHUB_SYNC_WEBHOOK_URL || !TIDUM_CREATORHUB_SYNC_SECRET) {
    return false;
  }

  try {
    const response = await fetch(CREATORHUB_SYNC_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-tidum-sync-secret": TIDUM_CREATORHUB_SYNC_SECRET,
      },
      body: JSON.stringify({
        ...payload,
        reviewedAt: normalizeDateValue(payload.reviewedAt),
        createdAt: normalizeDateValue(payload.createdAt),
        updatedAt: normalizeDateValue(payload.updatedAt),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "[Tidum Sync] Failed to sync access request to CreatorHub:",
        response.status,
        errorText,
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error("[Tidum Sync] Access request sync failed:", error);
    return false;
  }
}

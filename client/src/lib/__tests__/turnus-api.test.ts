import { afterEach, describe, expect, it, vi } from "vitest";
import {
  listAvdelinger,
  opprettAvdeling,
  listAnsatte,
  opprettAnsatt,
  listVaktkoder,
  opprettVaktkode,
  listRegler,
  opprettRegel,
  slettRegel,
  listOnsker,
  opprettOnske,
  getPrioritering,
  lagrePrioritering,
  listPlaner,
  opprettPlan,
  getReadiness,
  listVaktlinjer,
} from "../turnus-api";

afterEach(() => vi.restoreAllMocks());

it("listAvdelinger GETs the endpoint", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch" as any).mockResolvedValue({
    ok: true,
    json: async () => [{ id: 1, navn: "A" }],
  } as any);
  const rows = await listAvdelinger();
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining("/api/turnus/avdelinger"),
    expect.objectContaining({ credentials: "include" })
  );
  expect(rows[0].navn).toBe("A");
});

it("opprettRegel POSTs with JSON body", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch" as any).mockResolvedValue({
    ok: true,
    json: async () => ({ id: 1, regeltype: "x" }),
  } as any);
  const result = await opprettRegel({ regeltype: "x" });
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining("/api/turnus/regler"),
    expect.objectContaining({
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    })
  );
  expect(result.regeltype).toBe("x");
});

it("slettRegel DELETEs the endpoint", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch" as any).mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true }),
  } as any);
  const result = await slettRegel("1");
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining("/api/turnus/regler/1"),
    expect.objectContaining({
      method: "DELETE",
      credentials: "include",
    })
  );
  expect(result.ok).toBe(true);
});

it("getReadiness GETs with plan id", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch" as any).mockResolvedValue({
    ok: true,
    json: async () => ({ ready: true, mangler: [] }),
  } as any);
  const result = await getReadiness("123");
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining("/api/turnus/planer/123/readiness"),
    expect.objectContaining({ credentials: "include" })
  );
  expect(result.ready).toBe(true);
});

it("listVaktlinjer GETs with plan id", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch" as any).mockResolvedValue({
    ok: true,
    json: async () => [{ id: 1 }],
  } as any);
  const result = await listVaktlinjer("456");
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining("/api/turnus/planer/456/vaktlinjer"),
    expect.objectContaining({ credentials: "include" })
  );
  expect(result[0].id).toBe(1);
});

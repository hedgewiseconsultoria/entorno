import { beforeEach, describe, expect, it, vi } from "vitest";

const createSourceSnapshot = vi.fn(async (input: Record<string, unknown>) => ({ id: 1, ...input }));
const upsertSourcePayload = vi.fn(async (input: Record<string, unknown>) => ({ id: 1, ...input }));
vi.mock("./db", () => ({ createSourceSnapshot, upsertSourcePayload }));

const okResponse = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const occurrence = {
  id: "occ-1",
  documentNumber: 1,
  address: "Rua de teste, Salvador - BA",
  state: { name: "Bahia" },
  city: { name: "Salvador" },
  region: { region: "Nordeste" },
  neighborhood: { name: "TESTE" },
  latitude: "-13.0",
  longitude: "-38.5",
  date: "2026-09-20T12:00:00.000Z",
  policeAction: false,
  agentPresence: false,
  contextInfo: { mainReason: { name: "Disparos" }, complementaryReasons: [], clippings: [], massacre: false, policeUnit: "" },
  victims: [],
};

function fakeFetch() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/occurrences")) return okResponse({ pageMeta: { hasNextPage: false }, data: [occurrence] });
    return okResponse({ geometryType: "Point", features: [{ type: "Feature", geometry: { type: "Point", coordinates: [-38.5, -13] }, properties: { name: "Teste" } }] });
  });
}

describe("refreshPublicSources", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    createSourceSnapshot.mockClear();
    upsertSourcePayload.mockClear();
    process.env.FOGO_CRUZADO_API_SECRET = "test-secret";
    vi.stubGlobal("fetch", fakeFetch());
  });

  it("baixa as camadas GeoSalvador e gera os payloads JSON/CSV do Fogo Cruzado", async () => {
    const { refreshPublicSources } = await import("./source-refresh");
    const result = await refreshPublicSources();

    expect(result.sources).toHaveLength(4);
    expect(result.sources.every((source) => source.status === "ok")).toBe(true);
    expect(result.sources.find((source) => source.slug === "fogo-cruzado-salvador")).toMatchObject({ rowCount: 1, pages: 1 });
    expect(createSourceSnapshot).toHaveBeenCalledTimes(5);
    expect(upsertSourcePayload).toHaveBeenCalledTimes(4);
    expect(upsertSourcePayload).toHaveBeenCalledWith(expect.objectContaining({ sourceSlug: "fogo-cruzado-salvador-csv", format: "csv", rowCount: 1 }));
    expect(String(upsertSourcePayload.mock.calls.find(([input]) => input.sourceSlug === "fogo-cruzado-salvador-csv")?.[0].payload)).toContain("document_number");
  });

  it("preserva sucesso das demais fontes quando uma camada falha", async () => {
    const fetch = fakeFetch();
    fetch.mockRejectedValueOnce(new Error("timeout"));
    vi.stubGlobal("fetch", fetch);

    const { refreshPublicSources } = await import("./source-refresh");
    const result = await refreshPublicSources();

    expect(result.sources).toHaveLength(4);
    expect(result.sources[0]).toMatchObject({ slug: "geosalvador-bairros", status: "error" });
    expect(result.sources.slice(1).every((source) => source.status === "ok")).toBe(true);
    expect(createSourceSnapshot).toHaveBeenCalledTimes(5);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const createSourceSnapshot = vi.fn(async (input: Record<string, unknown>) => ({ id: 1, ...input }));
const upsertSourcePayload = vi.fn(async (input: Record<string, unknown>) => ({ id: 1, ...input }));
const downloadFogoCsvFromOfficialPage = vi.fn(async () => ({
  payload: "id,address\n50480,\"Rua de teste\"\n",
  rowCount: 1,
  sourceUrl: "https://api.fogocruzado.org.br/search",
  metadata: { method: "playwright-official-search-page", occurrenceType: "Completo" },
}));

vi.mock("./db", () => ({ createSourceSnapshot, upsertSourcePayload }));
vi.mock("./fogo-page-download", () => ({ downloadFogoCsvFromOfficialPage }));

const okResponse = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

function fakeFetch() {
  return vi.fn(async () => okResponse({
    geometryType: "Point",
    features: [{ type: "Feature", geometry: { type: "Point", coordinates: [-38.5, -13] }, properties: { name: "Teste" } }],
  }));
}

describe("refreshPublicSources", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    createSourceSnapshot.mockClear();
    upsertSourcePayload.mockClear();
    downloadFogoCsvFromOfficialPage.mockClear();
    vi.stubGlobal("fetch", fakeFetch());
  });

  it("baixa as camadas GeoSalvador e persiste o CSV baixado da página oficial", async () => {
    const { refreshPublicSources } = await import("./source-refresh");
    const result = await refreshPublicSources();

    expect(result.sources).toHaveLength(4);
    expect(result.sources.every((source) => source.status === "ok")).toBe(true);
    expect(result.sources.find((source) => source.slug === "fogo-cruzado-salvador")).toMatchObject({ rowCount: 1, method: "official-page-csv-download" });
    expect(downloadFogoCsvFromOfficialPage).toHaveBeenCalledTimes(1);
    expect(createSourceSnapshot).toHaveBeenCalledTimes(4);
    expect(upsertSourcePayload).toHaveBeenCalledTimes(4);
    expect(upsertSourcePayload).toHaveBeenCalledWith(expect.objectContaining({ sourceSlug: "fogo-cruzado-salvador-csv", format: "csv", rowCount: 1, payload: expect.stringContaining("50480") }));
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
    expect(downloadFogoCsvFromOfficialPage).toHaveBeenCalledTimes(1);
  });
});

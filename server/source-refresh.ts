import { createHash } from "node:crypto";
import { createSourceSnapshot, upsertSourcePayload } from "./db";
import { downloadFogoCsvFromOfficialPage } from "./fogo-page-download";

const ARCGIS_PAGE_SIZE = 2000;

const GEO_SOURCES = [
  { slug: "geosalvador-bairros", name: "GeoSalvador · Bairros", layer: "https://geo.salvador.ba.gov.br/arcgis/rest/services/Hosted/Bairros_Feicao/FeatureServer/0" },
  { slug: "geosalvador-escolas", name: "GeoSalvador · Escolas", layer: "https://geo.salvador.ba.gov.br/arcgis/rest/services/Hosted/Escolas_Pontos/FeatureServer/0" },
  { slug: "geosalvador-orgaos-publicos", name: "GeoSalvador · Órgãos públicos", layer: "https://geo.salvador.ba.gov.br/arcgis/rest/services/Hosted/ed_gov_mun_2021_p/FeatureServer/0" },
] as const;

function checksum(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function fetchJson(url: string, init?: RequestInit) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
    const body = await response.text();
    if (response.ok) return { response, body, json: JSON.parse(body) as any };
    if (response.status !== 429 || attempt === 3) {
      throw new Error(`HTTP ${response.status} em ${url}: ${body.slice(0, 300)}`);
    }
    const retryAfter = Number(response.headers.get("retry-after") ?? "0");
    const waitMs = Math.min(60_000, Math.max(2_000, retryAfter * 1_000 || 2 ** attempt * 2_000));
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  throw new Error(`Falha ao consultar ${url}`);
}

async function saveSnapshot(source: { slug: string; name: string; url: string }, body: string, rowCount: number, metadata: Record<string, unknown>) {
  const fetchedAt = new Date();
  const digest = checksum(body);
  const snapshot = await createSourceSnapshot({
    sourceSlug: source.slug,
    sourceName: source.name,
    sourceUrl: source.url,
    status: "ok",
    fetchedAt,
    httpStatus: 200,
    checksum: digest,
    rowCount,
    metadata: JSON.stringify(metadata).slice(0, 60_000),
  });
  return { fetchedAt, checksum: digest, snapshotId: snapshot?.id ?? null };
}

async function saveErrorSnapshot(source: { slug: string; name: string; url: string }, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const snapshot = await createSourceSnapshot({
    sourceSlug: source.slug,
    sourceName: source.name,
    sourceUrl: source.url,
    status: "error",
    fetchedAt: new Date(),
    metadata: JSON.stringify({ error: message.slice(0, 2_000) }),
  });
  return { slug: source.slug, status: "error", snapshotId: snapshot?.id ?? null, error: message.slice(0, 2_000) };
}

async function refreshGeoSource(source: typeof GEO_SOURCES[number]) {
  const features: any[] = [];
  let offset = 0;
  let lastResponse: Record<string, unknown> = {};
  while (true) {
    const params = new URLSearchParams({ where: "1=1", outFields: "*", returnGeometry: "true", outSR: "4326", f: "geojson", resultRecordCount: String(ARCGIS_PAGE_SIZE), resultOffset: String(offset) });
    const { json } = await fetchJson(`${source.layer}/query?${params}`);
    const page = Array.isArray(json.features) ? json.features : [];
    features.push(...page);
    lastResponse = { exceededTransferLimit: json.exceededTransferLimit ?? false, geometryType: json.geometryType };
    if (page.length < ARCGIS_PAGE_SIZE || json.exceededTransferLimit !== true) break;
    offset += page.length;
  }
  const payload = JSON.stringify({ type: "FeatureCollection", features });
  const info = await saveSnapshot({ slug: source.slug, name: source.name, url: `${source.layer}/query` }, payload, features.length, { format: "geojson", pages: Math.ceil(features.length / ARCGIS_PAGE_SIZE), ...lastResponse });
  await upsertSourcePayload({ sourceSlug: source.slug, sourceName: source.name, format: "geojson", sourceUrl: `${source.layer}/query`, fetchedAt: info.fetchedAt, rowCount: features.length, checksum: info.checksum, payload });
  return { slug: source.slug, status: "ok", rowCount: features.length, snapshotId: info.snapshotId, checksum: info.checksum };
}

async function refreshFogoSalvador() {
  const downloaded = await downloadFogoCsvFromOfficialPage();
  const info = await saveSnapshot(
    { slug: "fogo-cruzado-salvador-csv", name: "Fogo Cruzado · Salvador · CSV oficial", url: downloaded.sourceUrl },
    downloaded.payload,
    downloaded.rowCount,
    downloaded.metadata,
  );
  await upsertSourcePayload({
    sourceSlug: "fogo-cruzado-salvador-csv",
    sourceName: "Fogo Cruzado · Salvador · CSV oficial",
    format: "csv",
    sourceUrl: downloaded.sourceUrl,
    fetchedAt: info.fetchedAt,
    rowCount: downloaded.rowCount,
    checksum: info.checksum,
    payload: downloaded.payload,
  });
  return { slug: "fogo-cruzado-salvador", status: "ok", rowCount: downloaded.rowCount, csvSnapshotId: info.snapshotId, checksum: info.checksum, method: "official-page-csv-download" };
}

export async function refreshPublicSources() {
  const results: Array<Record<string, unknown>> = [];
  for (const source of GEO_SOURCES) {
    try { results.push(await refreshGeoSource(source)); }
    catch (error) { results.push(await saveErrorSnapshot({ slug: source.slug, name: source.name, url: `${source.layer}/query` }, error)); }
  }
  try { results.push(await refreshFogoSalvador()); }
  catch (error) {
    results.push(await saveErrorSnapshot({ slug: "fogo-cruzado-salvador", name: "Fogo Cruzado · Salvador · CSV oficial", url: "https://api.fogocruzado.org.br/search" }, error));
  }
  return { refreshedAt: new Date().toISOString(), sources: results };
}

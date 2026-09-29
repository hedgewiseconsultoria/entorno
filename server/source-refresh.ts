import { createHash } from "node:crypto";
import { createSourceSnapshot, upsertSourcePayload } from "./db";

const FOGO_BASE_URL = process.env.FOGO_CRUZADO_API_URL ?? "https://api-service.fogocruzado.org.br/api/v2";
const FOGO_SECRET = process.env.FOGO_CRUZADO_API_SECRET;
const BAHIA_ID = "d3a9b545-7056-4dc6-9b68-ce320c9edffc";
const SALVADOR_ID = "8f3a026f-2fc4-419c-9918-f0684a2abbec";
const PAGE_SIZE = 200;
const ARCGIS_PAGE_SIZE = 2000;

const GEO_SOURCES = [
  { slug: "geosalvador-bairros", name: "GeoSalvador · Bairros", layer: "https://geo.salvador.ba.gov.br/arcgis/rest/services/Hosted/Bairros_Feicao/FeatureServer/0" },
  { slug: "geosalvador-escolas", name: "GeoSalvador · Escolas", layer: "https://geo.salvador.ba.gov.br/arcgis/rest/services/Hosted/Escolas_Pontos/FeatureServer/0" },
  { slug: "geosalvador-orgaos-publicos", name: "GeoSalvador · Órgãos públicos", layer: "https://geo.salvador.ba.gov.br/arcgis/rest/services/Hosted/ed_gov_mun_2021_p/FeatureServer/0" },
] as const;

function checksum(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function occurrenceCsv(rows: Array<Record<string, any>>) {
  const headers = ["id", "document_number", "address", "state", "city", "region", "neighborhood", "sub_neighborhood", "locality", "latitude", "longitude", "occurrence_date", "police_action", "agent_presence", "police_unit", "main_reason", "complementary_reasons", "clippings", "massacre", "victim_count"];
  const lines = rows.map((row) => {
    const context = row.contextInfo ?? {};
    return [
      row.id,
      row.documentNumber,
      row.address,
      row.state?.name,
      row.city?.name,
      row.region?.region,
      row.neighborhood?.name,
      row.subNeighborhood?.name,
      row.locality?.name,
      row.latitude,
      row.longitude,
      row.date,
      row.policeAction,
      row.agentPresence,
      context.policeUnit,
      context.mainReason?.name,
      (context.complementaryReasons ?? []).map((item: any) => item.name).join("; "),
      (context.clippings ?? []).map((item: any) => item.name ?? item).join("; "),
      context.massacre,
      Array.isArray(row.victims) ? row.victims.length : 0,
    ].map(csvCell).join(",");
  });
  return [headers.join(","), ...lines].join("\n") + "\n";
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
  if (!FOGO_SECRET) throw new Error("FOGO_CRUZADO_API_SECRET não configurado no ambiente");
  const occurrences: Array<Record<string, any>> = [];
  let page = 1;
  while (true) {
    const params = new URLSearchParams({ idState: BAHIA_ID, idCities: SALVADOR_ID, page: String(page), take: String(PAGE_SIZE) });
    const { json } = await fetchJson(`${FOGO_BASE_URL}/occurrences?${params}`, { headers: { "x-api-secret": FOGO_SECRET, accept: "application/json" } });
    const rows = Array.isArray(json.data) ? json.data : [];
    occurrences.push(...rows);
    if (!json.pageMeta?.hasNextPage || rows.length === 0) break;
    page += 1;
  }
  const jsonPayload = JSON.stringify({ city: "Salvador", state: "Bahia", fetchedAt: new Date().toISOString(), data: occurrences });
  const csvPayload = occurrenceCsv(occurrences);
  const jsonInfo = await saveSnapshot({ slug: "fogo-cruzado-salvador-json", name: "Fogo Cruzado · Salvador · JSON completo", url: `${FOGO_BASE_URL}/occurrences` }, jsonPayload, occurrences.length, { format: "json", pages: page, cityId: SALVADOR_ID, stateId: BAHIA_ID });
  const csvInfo = await saveSnapshot({ slug: "fogo-cruzado-salvador-csv", name: "Fogo Cruzado · Salvador · CSV completo", url: "https://api.fogocruzado.org.br/search" }, csvPayload, occurrences.length, { format: "csv", pages: page, cityId: SALVADOR_ID, stateId: BAHIA_ID, generatedFrom: "occurrences API used by the official search/export page" });
  await upsertSourcePayload({ sourceSlug: "fogo-cruzado-salvador-csv", sourceName: "Fogo Cruzado · Salvador · CSV completo", format: "csv", sourceUrl: "https://api.fogocruzado.org.br/search", fetchedAt: csvInfo.fetchedAt, rowCount: occurrences.length, checksum: csvInfo.checksum, payload: csvPayload });
  return { slug: "fogo-cruzado-salvador", status: "ok", rowCount: occurrences.length, pages: page, csvSnapshotId: csvInfo.snapshotId, checksum: csvInfo.checksum };
}

export async function refreshPublicSources() {
  const results: Array<Record<string, unknown>> = [];
  for (const source of GEO_SOURCES) {
    try { results.push(await refreshGeoSource(source)); }
    catch (error) { results.push(await saveErrorSnapshot({ slug: source.slug, name: source.name, url: `${source.layer}/query` }, error)); }
  }
  try { results.push(await refreshFogoSalvador()); }
  catch (error) {
    results.push(await saveErrorSnapshot({ slug: "fogo-cruzado-salvador", name: "Fogo Cruzado · Salvador", url: `${FOGO_BASE_URL}/occurrences` }, error));
  }
  return { refreshedAt: new Date().toISOString(), sources: results };
}

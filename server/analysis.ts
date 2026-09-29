import { getSourcePayload, listApprovedReports } from "./db";

export type AnalysisMode = "morar" | "visitar";

const MODE_CONFIG: Record<AnalysisMode, { defaultRadiusMeters: number; violenceWindowDays: number; violenceWindowLabel: string; reportsWindowDays: number }> = {
  morar: { defaultRadiusMeters: 500, violenceWindowDays: 730, violenceWindowLabel: "últimos 24 meses", reportsWindowDays: 180 },
  visitar: { defaultRadiusMeters: 300, violenceWindowDays: 90, violenceWindowLabel: "últimos 90 dias", reportsWindowDays: 60 },
};

type Point = { lat: number; lon: number };
type FeatureCollection = { features?: Array<{ geometry?: { type?: string; coordinates?: unknown }; properties?: Record<string, unknown> }> };

const EARTH_RADIUS_METERS = 6_371_000;

function distanceMeters(a: Point, b: Point) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const lat1 = a.lat * rad;
  const lat2 = b.lat * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && quoted && line[i + 1] === '"') { cell += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { cells.push(cell); cell = ""; }
    else cell += char;
  }
  cells.push(cell);
  return cells;
}

function parseCsv(csv: string) {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [] as Array<Record<string, string>>;
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function pointFeatures(payload: string) {
  const collection = JSON.parse(payload) as FeatureCollection;
  return (collection.features ?? []).flatMap((feature) => {
    const coordinates = feature.geometry?.coordinates;
    if (feature.geometry?.type !== "Point" || !Array.isArray(coordinates) || coordinates.length < 2) return [];
    const lon = Number(coordinates[0]);
    const lat = Number(coordinates[1]);
    return Number.isFinite(lat) && Number.isFinite(lon) ? [{ point: { lat, lon }, properties: feature.properties ?? {} }] : [];
  });
}

function ringContains(point: Point, ring: Array<[number, number]>) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = yi > point.lat !== yj > point.lat && point.lon < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function polygonContains(point: Point, coordinates: unknown) {
  if (!Array.isArray(coordinates)) return false;
  const rings = coordinates as unknown[];
  if (rings.length === 0) return false;
  const outer = rings[0] as Array<[number, number]>;
  return Array.isArray(outer) && ringContains(point, outer);
}

async function getPayload(slug: string) {
  const payload = await getSourcePayload(slug);
  if (!payload) throw new Error(`Fonte ainda não sincronizada: ${slug}`);
  return payload;
}

export async function analyzeLocation(point: Point, radiusMeters?: number, mode: AnalysisMode = "morar") {
  if (point.lat < -13.2 || point.lat > -12.6 || point.lon < -38.8 || point.lon > -38.2) throw new Error("A análise está limitada ao município de Salvador.");
  const config = MODE_CONFIG[mode] ?? MODE_CONFIG.morar;
  const effectiveRadius = radiusMeters ?? config.defaultRadiusMeters;
  const [fogo, bairros, escolas, orgaos, approvedReports] = await Promise.all([
    getPayload("fogo-cruzado-salvador-csv"),
    getPayload("geosalvador-bairros"),
    getPayload("geosalvador-escolas"),
    getPayload("geosalvador-orgaos-publicos"),
    listApprovedReports().catch(() => []),
  ]);
  const occurrences = parseCsv(fogo.payload).flatMap((row) => {
    const lat = Number(row.latitude); const lon = Number(row.longitude);
    return Number.isFinite(lat) && Number.isFinite(lon) ? [{ point: { lat, lon }, date: row.occurrence_date }] : [];
  });
  const cutoff = Date.now() - config.violenceWindowDays * 24 * 60 * 60 * 1_000;
  const nearbyOccurrences = occurrences.filter((row) => distanceMeters(point, row.point) <= effectiveRadius);
  const recentOccurrences = nearbyOccurrences.filter((row) => Date.parse(row.date) >= cutoff);
  const schoolsNearby = pointFeatures(escolas.payload).filter(({ point: candidate }) => distanceMeters(point, candidate) <= 800);
  const orgaosNearby = pointFeatures(orgaos.payload).filter(({ point: candidate }) => distanceMeters(point, candidate) <= 800);
  const bairroCollection = JSON.parse(bairros.payload) as FeatureCollection;
  const bairro = (bairroCollection.features ?? []).find((feature) => {
    const geometry = feature.geometry;
    if (geometry?.type === "Polygon") return polygonContains(point, geometry.coordinates);
    if (geometry?.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) return (geometry.coordinates as unknown[]).some((polygon) => polygonContains(point, polygon));
    return false;
  });

  const reportsCutoff = Date.now() - config.reportsWindowDays * 24 * 60 * 60 * 1_000;
  const nearbyReports = (approvedReports ?? []).filter((report) => {
    const lat = report.latitude != null ? Number(report.latitude) : null;
    const lon = report.longitude != null ? Number(report.longitude) : null;
    if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    if (distanceMeters(point, { lat, lon }) > effectiveRadius) return false;
    const observed = report.observedAt ? Date.parse(String(report.observedAt)) : Date.parse(String(report.createdAt));
    return Number.isFinite(observed) ? observed >= reportsCutoff : true;
  });

  const freshness = [fogo, bairros, escolas, orgaos].map((source) => ({ source: source.sourceName, fetchedAt: source.fetchedAt, checksum: source.checksum }));

  const limitations = [
    "Fogo Cruzado registra violência armada notificada, não toda a criminalidade.",
    "A ausência de registros não prova ausência de risco.",
    "Distância de equipamentos não mede qualidade, frequência ou segurança do trajeto.",
  ];
  if (mode === "visitar") {
    limitations.push(
      "Estes indicadores descrevem o histórico da área, não o momento exato da sua visita — horário, dia da semana e evento local podem mudar o contexto.",
      "Os dados são sincronizados diariamente; em caso de emergência, ligue 190 em vez de recarregar a análise.",
    );
  }

  return {
    mode,
    point,
    radiusMeters: effectiveRadius,
    windowDays: config.violenceWindowDays,
    windowLabel: config.violenceWindowLabel,
    neighborhood: String(bairro?.properties?.nome_bairr ?? bairro?.properties?.bairro ?? bairro?.properties?.nome ?? bairro?.properties?.name ?? "Não identificado"),
    violence: { total: nearbyOccurrences.length, recentWindow: recentOccurrences.length },
    services: { schoolsWithin800m: schoolsNearby.length, publicBodiesWithin800m: orgaosNearby.length },
    community: { reportsNearby: nearbyReports.length, windowDays: config.reportsWindowDays },
    sources: freshness,
    limitations,
  };
}

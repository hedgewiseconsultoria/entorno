import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { sdk } from "./sdk";
import { ensurePublicSourcesFresh, refreshPublicSources, SOURCE_CACHE_TTL_MS } from "../source-refresh";
import { getSourcePayload, listLatestSourceSnapshots } from "../db";
import { serveStatic, setupVite } from "./vite";

const geocodeCache = new Map<string, { expiresAt: number; result: { lat: string; lon: string; display_name: string } | null }>();
let lastGeocodeAt = 0;

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.post("/api/scheduled/refresh-sources", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user.isCron || !user.taskUid) {
        return res.status(403).json({ error: "cron-only" });
      }
      const result = await refreshPublicSources();
      return res.json({ ok: true, ...result });
    } catch (error) {
      return res.status(500).json({
        error: error instanceof Error ? error.message : String(error),
        context: { url: req.originalUrl, timestamp: new Date().toISOString() },
      });
    }
  });
  app.get("/api/geocode", async (req, res) => {
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (!query) return res.status(400).json({ error: "query-required" });
    const cacheKey = query.toLowerCase();
    const cached = geocodeCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return res.json({ result: cached.result, cached: true });
    try {
      const waitMs = Math.max(0, 1_100 - (Date.now() - lastGeocodeAt));
      if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
      lastGeocodeAt = Date.now();
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("q", query.includes("Salvador") ? query : `${query}, Salvador, Bahia, Brasil`);
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("limit", "1");
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "Accept-Language": "pt-BR",
          "User-Agent": "entorno-salvador-mvp/1.0 (contato: projeto-entorno-salvador)",
        },
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) throw new Error(`Nominatim HTTP ${response.status}`);
      const results = await response.json() as Array<{ lat: string; lon: string; display_name: string }>;
      const result = results[0] ?? null;
      geocodeCache.set(cacheKey, { expiresAt: Date.now() + 24 * 60 * 60 * 1_000, result });
      return res.json({ result, cached: false });
    } catch (error) {
      return res.status(502).json({ error: "geocoding-unavailable", detail: error instanceof Error ? error.message : String(error) });
    }
  });
  app.get("/api/health/sources", async (_req, res) => {
    await ensurePublicSourcesFresh();
    const slugs = ["fogo-cruzado-salvador-csv", "geosalvador-bairros", "geosalvador-escolas", "geosalvador-orgaos-publicos"];
    const payloads = await Promise.all(slugs.map(async (sourceSlug) => {
      const payload = await getSourcePayload(sourceSlug);
      return payload ? { sourceSlug, status: "available", fetchedAt: payload.fetchedAt, rowCount: payload.rowCount, checksum: payload.checksum } : { sourceSlug, status: "missing" };
    }));
    const snapshots = await listLatestSourceSnapshots();
    return res.json({ ok: payloads.every((source) => source.status === "available"), payloads, latestSnapshots: snapshots.slice(0, 20) });
  });
  app.get("/api/data/:sourceSlug", async (req, res) => {
    const allowed = new Set([
      "fogo-cruzado-salvador-csv",
      "geosalvador-bairros",
      "geosalvador-escolas",
      "geosalvador-orgaos-publicos",
    ]);
    if (!allowed.has(req.params.sourceSlug)) return res.status(404).json({ error: "source-not-found" });
    const payload = await getSourcePayload(req.params.sourceSlug);
    if (!payload) return res.status(404).json({ error: "source-not-synchronized" });
    res.setHeader("Content-Type", payload.format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8");
    res.setHeader("X-Source-Fetched-At", payload.fetchedAt.toISOString());
    res.setHeader("X-Source-Checksum", payload.checksum);
    if (payload.format === "csv") res.setHeader("Content-Disposition", "attachment; filename=fogo-cruzado-salvador.csv");
    return res.send(payload.payload);
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    void ensurePublicSourcesFresh().catch((error) => console.error("[Cache] Initial source refresh failed:", error));
    setInterval(() => {
      void ensurePublicSourcesFresh().catch((error) => console.error("[Cache] Scheduled source refresh failed:", error));
    }, SOURCE_CACHE_TTL_MS);
  });
}

startServer().catch(console.error);

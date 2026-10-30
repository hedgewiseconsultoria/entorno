import { chromium } from "playwright";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SEARCH_URL = "https://api.fogocruzado.org.br/search";

function brazilToday() {
  const now = new Date();
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function countRowsFromPageText(text: string) {
  const matches = Array.from(text.matchAll(/\b(?:\d[\d.]*)\s*[–-]\s*(?:\d[\d.]*)\s+of\s+([\d.]+)/gi));
  const last = matches.at(-1)?.[1];
  return last ? Number(last.replaceAll(".", "")) : undefined;
}

export async function downloadFogoCsvFromOfficialPage() {
  const workdir = await mkdtemp(join(tmpdir(), "entorno-fogo-"));
  const downloadPath = join(workdir, "fogo-cruzado-salvador.csv");
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage({ acceptDownloads: true });
    await page.goto(SEARCH_URL, { waitUntil: "networkidle", timeout: 90_000 });

    await page.locator('[data-cy="state"]').click();
    await page.getByRole("option", { name: "Bahia", exact: true }).click();
    await page.waitForTimeout(500);

    await page.locator('[data-cy="cities"]').click();
    await page.getByRole("option", { name: "Salvador", exact: true }).click();

    await page.locator('[data-cy="initial-date"]').fill("2020-01-01");
    await page.locator('[data-cy="final-date"]').fill(brazilToday());

    await page.locator('[data-cy="type-occurrences"]').click();
    await page.getByRole("option", { name: "Completo", exact: true }).click();

    await page.locator('[data-cy="filter-button"]').click();
    const csvButton = page.locator('[data-cy="download-csv-button"]');
    await csvButton.waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForFunction(() => {
      const button = document.querySelector<HTMLButtonElement>('[data-cy="download-csv-button"]');
      return Boolean(button && !button.disabled);
    }, undefined, { timeout: 180_000 });

    const downloadPromise = page.waitForEvent("download", { timeout: 180_000 });
    await csvButton.click();
    const download = await downloadPromise;
    await download.saveAs(downloadPath);

    const payload = await readFile(downloadPath, "utf8");
    if (!payload.startsWith("id,")) {
      throw new Error("O download da página do Fogo Cruzado não retornou um CSV reconhecível");
    }

    const rowCount = countRowsFromPageText(await page.locator("body").innerText()) ?? Math.max(0, payload.trimEnd().split("\n").length - 1);
    return {
      payload,
      rowCount,
      sourceUrl: SEARCH_URL,
      metadata: {
        method: "playwright-official-search-page",
        state: "Bahia",
        city: "Salvador",
        initialDate: "2020-01-01",
        finalDate: brazilToday(),
        occurrenceType: "Completo",
        suggestedFilename: download.suggestedFilename(),
      },
    };
  } finally {
    await browser.close();
    await rm(workdir, { recursive: true, force: true });
  }
}

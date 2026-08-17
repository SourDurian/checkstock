import { chromium } from "playwright";
import { MONITOR_DEFAULTS } from "./config.js";
import { parseCatalogHtml } from "./parser.js";

function numericEnvironment(name, fallback, environment) {
  const parsed = Number.parseInt(environment[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function randomDelay(minimum, maximum) {
  return minimum + Math.floor(Math.random() * (maximum - minimum + 1));
}

function headlessMode(environment) {
  return !["0", "false", "no", "off"].includes(
    String(environment.MONITOR_HEADLESS ?? "true").toLowerCase(),
  );
}

function errorObservation(reason, error) {
  return {
    status: "unknown",
    availability: null,
    reason,
    error: error instanceof Error ? error.message : String(error),
  };
}

async function waitForCatalogOrBlock(page, timeoutMs) {
  await page.waitForFunction(() => {
    const text = `${document.title} ${document.body?.innerText ?? ""}`;
    return Boolean(document.querySelector(".package-title"))
      || /error\s*1015|you are being rate limited/i.test(text);
  }, null, { timeout: timeoutMs }).catch(() => {});
}

export async function checkTargets(targets, options = {}) {
  const environment = options.environment ?? process.env;
  const settings = {
    navigationTimeoutMs: numericEnvironment(
      "MONITOR_NAVIGATION_TIMEOUT_MS",
      MONITOR_DEFAULTS.navigationTimeoutMs,
      environment,
    ),
    challengeWaitMs: numericEnvironment(
      "MONITOR_CHALLENGE_WAIT_MS",
      MONITOR_DEFAULTS.challengeWaitMs,
      environment,
    ),
    minDelayMs: numericEnvironment("MONITOR_MIN_DELAY_MS", MONITOR_DEFAULTS.minDelayMs, environment),
    maxDelayMs: numericEnvironment("MONITOR_MAX_DELAY_MS", MONITOR_DEFAULTS.maxDelayMs, environment),
  };
  if (settings.maxDelayMs < settings.minDelayMs) settings.maxDelayMs = settings.minDelayMs;

  const browser = await chromium.launch({ headless: headlessMode(environment) });
  const context = await browser.newContext({
    locale: "en-US",
    timezoneId: "Asia/Hong_Kong",
  });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(settings.navigationTimeoutMs);
  const observations = [];

  try {
    for (const [index, target] of targets.entries()) {
      let result;
      try {
        await page.goto(target.catalogUrl, { waitUntil: "domcontentloaded" });
        await waitForCatalogOrBlock(page, settings.challengeWaitMs);
        result = parseCatalogHtml(await page.content(), target, target.catalogUrl);
      } catch (error) {
        result = errorObservation("navigation-error", error);
      }
      observations.push({ target, result });

      if (index < targets.length - 1) {
        const delay = randomDelay(settings.minDelayMs, settings.maxDelayMs);
        await page.waitForTimeout(delay);
      }
    }
  } finally {
    await context.close();
    await browser.close();
  }

  return observations;
}

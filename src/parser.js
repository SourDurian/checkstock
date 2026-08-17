import * as cheerio from "cheerio";

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function unknown(reason, details = {}) {
  return {
    status: "unknown",
    availability: null,
    reason,
    ...details,
  };
}

function isCloudflareBlock(title, body) {
  const text = `${title} ${body}`;
  return [
    /just a moment/i,
    /error\s*1015/i,
    /you are being rate limited/i,
    /enable javascript and cookies to continue/i,
    /cdn-cgi\/challenge-platform/i,
  ].some((pattern) => pattern.test(text));
}

export function parseCatalogHtml(html, target, sourceUrl = target.catalogUrl) {
  const $ = cheerio.load(html ?? "");
  const title = normalize($("title").text());
  const body = normalize($("body").text());

  if (isCloudflareBlock(title, `${body} ${html}`)) {
    return unknown("cloudflare-block", { pageTitle: title });
  }

  const card = $(".package")
    .toArray()
    .find((element) => normalize($(element).find(".package-title").first().text()) === target.name);

  if (!card) {
    return unknown("target-missing", { pageTitle: title });
  }

  const packageElement = $(card);
  const observedPrice = normalize(packageElement.find(".price-amount").first().text());
  const observedCycle = normalize(packageElement.find(".price-cycle").first().text());
  const quantityText = normalize(packageElement.find(".package-qty").first().text());
  const orderButton = packageElement.find(".btn-order-now").first();
  const orderHref = normalize(orderButton.attr("href"));
  const buttonClasses = normalize(orderButton.attr("class"));
  const ariaDisabled = normalize(orderButton.attr("aria-disabled")).toLowerCase();
  const isDisabled = /(^|\s)disabled(\s|$)/.test(buttonClasses)
    || orderButton.is("[disabled]")
    || ariaDisabled === "true";

  if (observedPrice !== target.price) {
    return unknown("price-mismatch", { observedPrice, observedCycle });
  }
  if (observedCycle !== target.cycle) {
    return unknown("cycle-mismatch", { observedPrice, observedCycle });
  }
  if (!orderHref) {
    return unknown("order-link-missing", { observedPrice, observedCycle });
  }

  let observedOrderUrl;
  try {
    observedOrderUrl = new URL(orderHref, sourceUrl).toString();
  } catch {
    return unknown("order-link-invalid", { observedPrice, observedCycle });
  }

  if (new URL(observedOrderUrl).pathname !== new URL(target.orderUrl).pathname) {
    return unknown("order-link-mismatch", {
      observedPrice,
      observedCycle,
      observedOrderUrl,
    });
  }

  const quantityMatch = quantityText.match(/(\d+)\s+Available/i);
  if (!quantityMatch) {
    return unknown("quantity-missing", {
      observedPrice,
      observedCycle,
      observedOrderUrl,
    });
  }

  const availability = Number.parseInt(quantityMatch[1], 10);
  const common = {
    availability,
    observedPrice,
    observedCycle,
    observedOrderUrl,
  };

  if (availability > 0 && !isDisabled) {
    return { status: "in_stock", reason: null, ...common };
  }
  if (availability === 0 && isDisabled) {
    return { status: "out_of_stock", reason: null, ...common };
  }

  return unknown("inconsistent-stock-signals", {
    ...common,
    buttonDisabled: isDisabled,
  });
}

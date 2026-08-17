import assert from "node:assert/strict";
import test from "node:test";
import { TARGETS } from "../src/config.js";
import { parseCatalogHtml } from "../src/parser.js";

const target = TARGETS[0];

function packageCard({
  name = target.name,
  price = target.price,
  cycle = target.cycle,
  quantity = 0,
  disabled = quantity === 0,
  href = new URL(target.orderUrl).pathname,
} = {}) {
  return `<div class="package">
    <h3 class="package-title">${name}</h3>
    <div class="price-amount">${price}</div>
    <div class="price-cycle">${cycle}</div>
    <a class="btn-order-now${disabled ? " disabled" : ""}" href="${href}">Order Now</a>
    <div class="package-qty">${quantity} Available</div>
  </div>`;
}

function page(...cards) {
  return `<html><head><title>Shopping Cart - VMISS</title></head><body>${cards.join("")}</body></html>`;
}

test("parses an exact zero-stock package", () => {
  const result = parseCatalogHtml(page(packageCard()), target);
  assert.equal(result.status, "out_of_stock");
  assert.equal(result.availability, 0);
});

test("parses an exact in-stock package", () => {
  const result = parseCatalogHtml(page(packageCard({ quantity: 3 })), target);
  assert.equal(result.status, "in_stock");
  assert.equal(result.availability, 3);
  assert.equal(result.observedOrderUrl, target.orderUrl);
});

test("rejects a price change", () => {
  const result = parseCatalogHtml(page(packageCard({ price: "$6.00 CAD" })), target);
  assert.equal(result.status, "unknown");
  assert.equal(result.reason, "price-mismatch");
});

test("does not match another in-stock plan", () => {
  const other = packageCard({ name: "US.LA.CN2.Pro", price: "$20.00 CAD", quantity: 1 });
  const result = parseCatalogHtml(page(other), target);
  assert.equal(result.status, "unknown");
  assert.equal(result.reason, "target-missing");
});

test("rejects conflicting quantity and button signals", () => {
  const result = parseCatalogHtml(page(packageCard({ quantity: 2, disabled: true })), target);
  assert.equal(result.status, "unknown");
  assert.equal(result.reason, "inconsistent-stock-signals");
});

test("rejects a changed order link", () => {
  const result = parseCatalogHtml(page(packageCard({ href: "/store/other/basic" })), target);
  assert.equal(result.status, "unknown");
  assert.equal(result.reason, "order-link-mismatch");
});

test("detects a Cloudflare challenge", () => {
  const result = parseCatalogHtml("<html><title>Just a moment...</title><body>Enable JavaScript and cookies to continue</body></html>", target);
  assert.equal(result.status, "unknown");
  assert.equal(result.reason, "cloudflare-block");
});

test("detects Cloudflare error 1015", () => {
  const result = parseCatalogHtml("<html><body>Error 1015 You are being rate limited</body></html>", target);
  assert.equal(result.status, "unknown");
  assert.equal(result.reason, "cloudflare-block");
});

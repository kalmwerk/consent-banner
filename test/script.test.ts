import { existsSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import pkg from "../package.json" with { type: "json" };
import { closeX, dialog, fromRoot, resetPage, shadow, w } from "./helpers.js";

const FILE = fromRoot("dist/consent-banner.min.js");
if (!existsSync(FILE)) throw new Error("Run `npm run build` first: dist/consent-banner.min.js is missing.");
const CODE = readFileSync(FILE, "utf8");

/** Run the script-tag build as if a <script> with these attributes had loaded it. */
function load(attrs: Record<string, string> = {}) {
  const tag = document.createElement("script");
  for (const [k, v] of Object.entries(attrs)) tag.setAttribute(k, v);
  const current = vi.spyOn(document, "currentScript", "get").mockReturnValue(tag);
  try {
    new Function(CODE)();
  } finally {
    current.mockRestore();
  }
  return w.PrivacyPill;
}

beforeEach(resetPage);
afterEach(resetPage);

describe("script-tag build", () => {
  it("starts on its own and reports its version", () => {
    const pp = load();
    expect(pp?.version).toBe(pkg.version);
    expect(dialog()).not.toBeNull();
  });

  it("reads data-config", () => {
    load({ "data-config": JSON.stringify({ layout: "bar", closeX: false, policyUrl: "/privacy" }) });
    expect(shadow()!.querySelector(".b.bar")).not.toBeNull();
    expect(closeX()).toBeNull();
    expect(shadow()!.querySelector("a")?.getAttribute("href")).toBe("/privacy");
  });

  it("reads window.PrivacyPillConfig", () => {
    w.PrivacyPillConfig = { layout: "corner" };
    load();
    expect(shadow()!.querySelector(".b.corner")).not.toBeNull();
  });

  it("still guards the page with the defaults when data-config is broken", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      load({ "data-config": "{oops" });
    } finally {
      warn.mockRestore();
    }
    expect(dialog()).not.toBeNull();
    expect(w.dataLayer!.length).toBeGreaterThan(0);
  });

  it("waits for PrivacyPill.init() with data-manual", () => {
    const pp = load({ "data-manual": "" });
    expect(document.getElementById("privacypill")).toBeNull();
    pp!.init({ layout: "modal" });
    expect(shadow()!.querySelector(".b.modal")).not.toBeNull();
  });

  it.each([
    ["en", "We value your privacy"],
    ["de", "Wir respektieren Ihre Privatsphäre"],
    ["fr", "Nous respectons votre vie privée"],
    ["nl", "Wij respecteren je privacy"],
    ["es", "Respetamos tu privacidad"],
    ["it", "Rispettiamo la tua privacy"],
  ])("speaks %s out of the box", (lang, title) => {
    document.documentElement.lang = lang;
    load();
    expect(shadow()!.querySelector("#ppt")?.textContent).toBe(title);
  });

  it("stays out of the way when another PrivacyPill script already runs the banner", () => {
    const other = { v: "1.0.0" } as unknown as NonNullable<typeof w.PrivacyPill>;
    w.PrivacyPill = other;
    load();
    expect(w.PrivacyPill).toBe(other);
    expect(document.getElementById("privacypill")).toBeNull();
  });

  it("stays under 9 kB gzipped with all six languages", () => {
    expect(gzipSync(CODE, { level: 9 }).length).toBeLessThan(9 * 1024);
  });

  it("contains no network code and no URLs", () => {
    expect(CODE).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts|new Image/);
    expect(CODE).not.toMatch(/https?:\/\//);
  });
});

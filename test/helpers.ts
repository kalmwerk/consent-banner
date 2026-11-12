import path from "node:path";
import { fileURLToPath } from "node:url";
import { vi } from "vitest";
import type { ConsentBannerApi, ConsentBannerConfig } from "../src/types.js";

/** The package folder (tests read built files from dist/). */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const fromRoot = (p: string) => path.join(ROOT, p);

export const w = window as Window & { dataLayer?: unknown[] };

export function clearCookies(): void {
  for (const c of document.cookie.split("; ")) {
    const name = c.split("=")[0];
    if (name) document.cookie = `${name}=;path=/;max-age=0`;
  }
}

export function resetPage(): void {
  delete w.PrivacyPill;
  delete w.PrivacyPillConfig;
  w.dataLayer = [];
  clearCookies();
  document.body.innerHTML = "";
  document.documentElement.lang = "";
}

/** A fresh copy of the package, as if the page had just loaded. */
export async function load() {
  vi.resetModules();
  return import("../src/index.js");
}

export async function boot(config: ConsentBannerConfig = {}): Promise<ConsentBannerApi> {
  const { initConsentBanner } = await load();
  return initConsentBanner(config);
}

export const shadow = () => document.getElementById("privacypill")?.shadowRoot ?? null;
export const control = (a: string) => shadow()!.querySelector<HTMLElement>(`[data-a=${a}]`)!;
export const closeX = () => shadow()?.querySelector<HTMLButtonElement>(".b [data-a=dismiss]") ?? null;
export const panelClose = () => shadow()!.querySelector<HTMLElement>(".P [data-a=close]")!;
export const dialog = () => shadow()?.querySelector("[role=dialog]") ?? null;

/** The focused element, looking inside the banner's shadow root. */
export const active = () => {
  const a = document.activeElement;
  return a?.id === "privacypill" ? shadow()!.activeElement : a;
};

export const press = (el: Element, key: string, shiftKey = false) => {
  const e = new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, composed: true, cancelable: true });
  el.dispatchEvent(e);
  return e;
};

export const storedChoice = (name = "pp_consent") => {
  const raw = document.cookie
    .split("; ")
    .find((c) => c.startsWith(name + "="))
    ?.slice(name.length + 1);
  return raw
    ? (JSON.parse(decodeURIComponent(raw)) as { id: string; r: number; t: number; m: string; c: Record<string, boolean> })
    : null;
};

/** gtag() pushes Arguments objects; normalise them to arrays. */
export function gtagCalls(): unknown[][] {
  return (w.dataLayer ?? [])
    .filter((e) => e && typeof e == "object" && !("event" in (e as object)))
    .map((e) => Array.from(e as ArrayLike<unknown>));
}

export function consentCalls(kind: "default" | "update") {
  return gtagCalls()
    .filter((a) => a[0] === "consent" && a[1] === kind)
    .map((a) => a[2] as Record<string, string | number>);
}

export function dataLayerEvents() {
  return (w.dataLayer ?? []).filter((e) => e && typeof e == "object" && "event" in (e as object)) as {
    event: string;
    privacypill: Record<string, string>;
  }[];
}

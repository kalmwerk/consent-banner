/**
 * @kalmwerk/consent-banner — a dependency-free cookie consent banner with Google Consent Mode v2.
 *
 *   import { initConsentBanner } from "@kalmwerk/consent-banner";
 *   initConsentBanner({ policyUrl: "/privacy" });
 *
 * Nothing here talks to a server: the choice lives in a first-party cookie on your own domain.
 */
import "./global.js";
import { api, gcmSignals, VERSION } from "./core.js";
import type { ConsentBannerApi, ConsentBannerConfig } from "./types.js";

export { gcmSignals, VERSION };
export type * from "./types.js";

/**
 * Inline fail-safe for the top of <head>, before Google Tag Manager or gtag.js: every Consent Mode
 * signal starts denied even if the banner script loads late or not at all.
 */
export const CONSENT_DEFAULTS_SNIPPET =
  "<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',functionality_storage:'denied',personalization_storage:'denied',security_storage:'granted',wait_for_update:500});</script>";

/**
 * Start the banner (or restart it with a new configuration). Call it in the browser, as early as
 * you can. Also exposes the API as window.PrivacyPill so plain links can call PrivacyPill.open().
 */
export function initConsentBanner(config?: ConsentBannerConfig): ConsentBannerApi {
  if (typeof window == "undefined" || typeof document == "undefined")
    throw new Error("initConsentBanner() runs in the browser. Call it from client-side code.");
  const existing = window.PrivacyPill;
  if (existing && existing !== api) {
    console.warn("[consent-banner] Another PrivacyPill banner is already on this page; not starting a second one.");
    return existing;
  }
  window.PrivacyPill = api;
  return api.init(config);
}

/** The banner API once initConsentBanner() has run, otherwise undefined. Safe to call during SSR. */
export function getConsentBanner(): ConsentBannerApi | undefined {
  return typeof window != "undefined" && window.PrivacyPill === api ? api : undefined;
}

/**
 * Script-tag build (dist/consent-banner.min.js). Starts on load with all six languages:
 *
 *   <script src="/consent-banner.min.js" data-config='{"policyUrl":"/privacy"}'></script>
 *
 * Configure with data-config (JSON) or window.PrivacyPillConfig set before the script.
 * Add data-manual to start it yourself with PrivacyPill.init({...}).
 */
import "./global.js";
import { api, setDefaultLocales } from "./core.js";
import { locales } from "./locales.js";
import type { ConsentBannerConfig } from "./types.js";

// Another PrivacyPill script (hosted or a second copy) already runs the banner here.
if (!(window.PrivacyPill && window.PrivacyPill.v)) {
  setDefaultLocales(locales);
  window.PrivacyPill = api;
  const s = document.currentScript;
  if (!(s && s.hasAttribute("data-manual"))) {
    let c: ConsentBannerConfig | undefined = window.PrivacyPillConfig;
    const attr = s && s.getAttribute("data-config");
    if (!c && attr) {
      try {
        c = JSON.parse(attr) as ConsentBannerConfig;
      } catch (e) {
        // A broken config must not leave trackers unguarded: start with the safe defaults.
        console.warn("[consent-banner] data-config is not valid JSON; using the defaults.", e);
      }
    }
    api.init(c);
  }
}

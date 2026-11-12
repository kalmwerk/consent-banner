import type { ConsentBannerApi, ConsentBannerConfig, ConsentEventDetail } from "./types.js";

declare global {
  interface Window {
    /** The banner API, also reachable as a global for "Cookie settings" links. */
    PrivacyPill?: ConsentBannerApi;
    /** Configuration read by the script-tag build when it loads. */
    PrivacyPillConfig?: ConsentBannerConfig;
  }
  interface WindowEventMap {
    "privacypill:ready": CustomEvent<ConsentEventDetail>;
    "privacypill:consent": CustomEvent<ConsentEventDetail>;
    "privacypill:show": CustomEvent<ConsentEventDetail>;
    "privacypill:hide": CustomEvent<ConsentEventDetail>;
    "privacypill:reset": CustomEvent<ConsentEventDetail>;
  }
}

export {};

/** The four consent categories. "necessary" is always on and can't be switched off. */
export type Category = "necessary" | "analytics" | "marketing" | "functional";
/** The categories a visitor can switch on or off. */
export type OptionalCategory = Exclude<Category, "necessary">;
export type Layout = "pill" | "bar" | "modal" | "corner";
export type ButtonStyle = "outline" | "soft" | "text";
export type ConsentSignal = "granted" | "denied";
/** How a choice was made: a banner button, the preferences panel ("custom") or your own code ("api"). */
export type ConsentMethod = "accept" | "reject" | "custom" | "api";
export type ConsentEventType = "ready" | "consent" | "show" | "hide" | "reset";

export interface ConsentState {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  functional: boolean;
}

/** Google Consent Mode v2 signals, derived from the consent state. */
export interface GcmSignals {
  ad_storage: ConsentSignal;
  ad_user_data: ConsentSignal;
  ad_personalization: ConsentSignal;
  analytics_storage: ConsentSignal;
  functionality_storage: ConsentSignal;
  personalization_storage: ConsentSignal;
  security_storage: "granted";
}

export interface ConsentEventDetail {
  type: ConsentEventType;
  consent: ConsentState;
  gcm: GcmSignals;
  /** True once the visitor (or your code) has made a choice. */
  decided: boolean;
  /** Random, pseudonymous id of this browser's choice. Never sent anywhere by this package. */
  id?: string;
  method?: ConsentMethod;
  /** "close" when the visitor closed the banner with the X (stored as a refusal). */
  via?: "close";
  view?: "banner" | "preferences";
}

export type ConsentListener = (detail: ConsentEventDetail) => void;

/** What the consent cookie holds (JSON, URI-encoded). */
export interface StoredChoice {
  /** Pseudonymous id. */
  id: string;
  /** Banner revision the choice was made for. */
  r: number;
  /** Time of the choice (ms since epoch). */
  t: number;
  m: ConsentMethod;
  c: ConsentState;
}

export interface CategoryText {
  name: string;
  desc: string;
}

export interface BannerTexts {
  title: string;
  body: string;
  accept: string;
  reject: string;
  customize: string;
  save: string;
  prefsTitle: string;
  prefsBody: string;
  policy: string;
  /** Accessible name of the floating reopen button. */
  settings: string;
  close: string;
  /** Accessible name of the first-layer X: closing keeps only necessary cookies. */
  dismiss: string;
  alwaysOn: string;
  necessary: CategoryText;
  analytics: CategoryText;
  marketing: CategoryText;
  functional: CategoryText;
}

/** Partial texts for one language, merged over the built-in (or English) texts. */
export type TextOverrides = Partial<Omit<BannerTexts, Category>> & {
  [K in Category]?: Partial<CategoryText>;
};

/** Complete texts per language code ("en", "de", …). */
export type Locales = Record<string, BannerTexts>;

export interface Theme {
  /** Background colour. Default "#fff". */
  bg: string;
  /** Text colour. Default "#0f172a". */
  fg: string;
  /** Accent (primary button, switches, focus ring). Default "#0f766e". */
  accent: string;
  /** Text on the accent colour. Default "#fff". */
  accentFg: string;
  /** Border colour. Default "rgba(15,23,42,.12)". */
  border: string;
  /** Corner radius of the banner in px. Default 16. */
  radius: number;
  /** Corner radius of the buttons in px. Default 999 (pill). */
  btnRadius: number;
  /** CSS font-family. Default: inherit from your page. */
  font: string;
  /** Base font size in px. Default 14. */
  size: number;
  /** Drop shadow. Default true. */
  shadow: boolean;
  /** Style of the secondary buttons. Default "outline". */
  buttons: ButtonStyle;
}

export interface ConsentBannerConfig {
  /** Default "pill". "modal" blocks the page until the visitor chooses and traps keyboard focus. */
  layout?: Layout;
  /** Side for the corner layout and the reopen button. Default "left". */
  side?: "left" | "right";
  theme?: Partial<Theme>;
  /** Give "Reject" the same style as "Accept all". Default true. */
  equal?: boolean;
  /** Show a small floating button to change the choice later. Default true. */
  reopen?: boolean;
  /** Show an X on the banner; closing counts as rejecting non-essential cookies. Default true. */
  closeX?: boolean;
  /** Set a category to false to leave it out of the preferences panel. All on by default. */
  categories?: Partial<Record<OptionalCategory, boolean>>;
  /** Services listed under each category in the preferences panel, e.g. { analytics: ["Google Analytics"] }. */
  services?: Partial<Record<Category, string[]>>;
  /** First-party cookie name prefixes to delete when a category is withdrawn, e.g. { analytics: ["_ga"] }. */
  purge?: Partial<Record<OptionalCategory, string[]>>;
  /** Send Google Consent Mode v2 commands to window.dataLayer. Default true. */
  gcm?: boolean;
  /** wait_for_update in the Consent Mode default, in ms. Default 500. */
  wait?: number;
  /** Consent Mode ads_data_redaction while ad_storage is denied. Default true. */
  redact?: boolean;
  /** Consent Mode url_passthrough. Default false. */
  passthrough?: boolean;
  /** Fallback language when none of the visitor's languages is available. Default "en". */
  lang?: string;
  /** Pick the language from <html lang> and the browser's languages. Default true. */
  autoLang?: boolean;
  /** Only offer these language codes. Default: every language in `locales` and `texts`. */
  languages?: string[];
  /** Extra complete languages (ESM builds include English only; import more from "@kalmwerk/consent-banner/locales"). */
  locales?: Locales;
  /** Your own wording per language, merged over the built-in texts. */
  texts?: Record<string, TextOverrides>;
  /** Link to your cookie or privacy policy: a full https:// URL or a path starting with "/". */
  policyUrl?: string;
  /** Days the choice is remembered. Default 182 (about six months). */
  expiry?: number;
  /** Bump this number to ask every visitor again (for example after adding a new tool). Default 1. */
  revision?: number;
  /** Name of the consent cookie. Default "pp_consent" (same as PrivacyPill's hosted script). */
  cookieName?: string;
  /** Cookie domain, e.g. ".example.com" to share the choice across subdomains. */
  cookieDomain?: string;
  /** Reload the page when a visitor withdraws a category, so already-running scripts stop. Default false. */
  reloadOnWithdraw?: boolean;
}

export interface ConsentBannerApi {
  /** Package version. */
  readonly version: string;
  /** Same as version; other PrivacyPill scripts check it to avoid starting a second banner. */
  readonly v: string;
  /** (Re)start the banner with a new configuration. */
  init(config?: ConsentBannerConfig): ConsentBannerApi;
  /** Open the preferences panel, e.g. from a "Cookie settings" link in your footer. */
  open(): void;
  /** Show the first layer of the banner again. */
  show(): void;
  accept(): void;
  reject(): void;
  /** Store a choice from your own code; missing categories are off. */
  set(consent: Partial<Record<OptionalCategory, boolean>>): void;
  /** The current choice, or null while the visitor hasn't chosen. */
  get(): ConsentState | null;
  /** Whether a category is allowed right now ("necessary" always is). */
  allowed(category: Category): boolean;
  /** Listen to ready / consent / show / hide / reset. Returns a function that stops listening. */
  on(listener: ConsentListener): () => void;
  /** Forget the choice and ask again. */
  reset(): void;
  /** Remove the banner and its listeners from the page. The stored choice stays. */
  destroy(): void;
}

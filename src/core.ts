/*
 * The banner itself: one instance per page, no dependencies, no network requests.
 * Markup, cookie, events and the window.PrivacyPill API match PrivacyPill's hosted script,
 * so a site can move between the two without changing its pages or asking visitors again.
 */
import { en } from "./locales/en.js";
import type {
  BannerTexts,
  Category,
  ConsentBannerApi,
  ConsentBannerConfig,
  ConsentEventDetail,
  ConsentEventType,
  ConsentListener,
  ConsentMethod,
  ConsentSignal,
  ConsentState,
  GcmSignals,
  Locales,
  OptionalCategory,
  StoredChoice,
} from "./types.js";

export const VERSION: string = __VERSION__;

const CATS: readonly OptionalCategory[] = ["analytics", "marketing", "functional"];
/**
 * Controls that take part in keyboard focus, in reading order. A dialog's first control is never
 * a consent button: Customise always comes before Reject/Accept and the close X comes last.
 */
const FOCUSABLE = "a[href],button,input:not([disabled])";

type Root = ShadowRoot | HTMLElement;
type Win = Window & { dataLayer?: unknown[] };

let defaults: Locales = { en };
let cfg: ConsentBannerConfig = {};
let t: BannerTexts = en;
let state: StoredChoice | null = null;
/** The choice when cookies can't be written (kept for this page view only). */
let mem: StoredChoice | null = null;
let host: HTMLElement | null = null;
let root: Root | null = null;
let booted = false;
/** The page element focus came from, so it can go back there when the banner closes. */
let back: HTMLElement | null = null;
/** Which banner button opened the preferences ("customize" or "open"), if any. */
let from: string | null = null;
let subs: ConsentListener[] = [];

/** Languages the script-tag build ships with (the ESM build only has English). */
export function setDefaultLocales(l: Locales): void {
  defaults = l;
}

function layer(): unknown[] {
  const w = window as Win;
  return (w.dataLayer = w.dataLayer || []);
}

function gtag(..._args: unknown[]): void {
  // Google tags read Arguments objects from the dataLayer, not arrays.
  // eslint-disable-next-line prefer-rest-params
  layer().push(arguments);
}

const g = (on: boolean): ConsentSignal => (on ? "granted" : "denied");

/** Category choice → Google Consent Mode v2 signals. */
export function gcmSignals(c: ConsentState): GcmSignals {
  return {
    ad_storage: g(c.marketing),
    ad_user_data: g(c.marketing),
    ad_personalization: g(c.marketing),
    analytics_storage: g(c.analytics),
    functionality_storage: g(c.functional),
    personalization_storage: g(c.functional),
    security_storage: "granted",
  };
}

const all = (on: boolean): ConsentState => ({
  necessary: true,
  analytics: on,
  marketing: on,
  functional: on,
});

function esc(s: unknown): string {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (m) => "&#" + m.charCodeAt(0) + ";");
}

const cookieName = () => cfg.cookieName || "pp_consent";
const revision = () => cfg.revision || 1;
const hasX = () => cfg.closeX !== false;

function read(): StoredChoice | null {
  const pre = cookieName() + "=";
  try {
    for (const part of document.cookie.split("; "))
      if (part.indexOf(pre) == 0) return JSON.parse(decodeURIComponent(part.slice(pre.length)));
  } catch (e) {
    // Unreadable cookie: treat as no choice and ask again.
  }
  return mem;
}

function write(s: StoredChoice | null): void {
  mem = s;
  try {
    document.cookie =
      cookieName() +
      "=" +
      encodeURIComponent(s ? JSON.stringify(s) : "") +
      ";path=/;max-age=" +
      (s ? (cfg.expiry || 182) * 864e2 : 0) +
      ";SameSite=Lax" +
      (location.protocol == "https:" ? ";Secure" : "") +
      (cfg.cookieDomain ? ";domain=" + cfg.cookieDomain : "");
  } catch (e) {
    // Cookies blocked: the choice lasts for this page view.
  }
}

function allowed(cat: Category | string): boolean {
  return cat == "necessary" || !!(state && state.c[cat as OptionalCategory]);
}

function emit(type: ConsentEventType, extra?: Partial<ConsentEventDetail>): void {
  const c = state ? state.c : all(false);
  const detail: ConsentEventDetail = {
    type,
    consent: { ...c },
    gcm: gcmSignals(c),
    decided: !!state,
    ...(state ? { id: state.id, method: state.m } : {}),
    ...extra,
  };
  const flags: Record<string, ConsentSignal> = {};
  for (const k of CATS) flags[k] = g(c[k]);
  layer().push({ event: "privacypill_" + type, privacypill: flags });
  try {
    window.dispatchEvent(new CustomEvent("privacypill:" + type, { detail }));
  } catch (e) {
    // Very old browsers without CustomEvent: listeners via on() still run.
  }
  for (const fn of subs.slice()) {
    try {
      fn(detail);
    } catch (e) {
      // One broken listener must not stop the others.
    }
  }
}

/** Activate <script type="text/plain" data-pp-category="…"> and elements with data-pp-src. */
function unblock(): void {
  const els = document.querySelectorAll<HTMLElement & { ppOn?: 1 }>("[data-pp-category]");
  for (const el of Array.from(els)) {
    if (el.ppOn || !allowed(el.getAttribute("data-pp-category") || "")) continue;
    el.ppOn = 1;
    if (el instanceof HTMLScriptElement && el.type == "text/plain") {
      const n = document.createElement("script");
      for (const a of Array.from(el.attributes)) if (a.name != "type") n.setAttribute(a.name, a.value);
      // Browsers hide the nonce attribute after parsing; copy the property so CSP still allows it.
      if (el.nonce) n.nonce = el.nonce;
      n.type = el.getAttribute("data-pp-type") || "text/javascript";
      if (!el.src) n.text = el.text;
      if (el.parentNode) el.parentNode.replaceChild(n, el);
    } else {
      const src = el.getAttribute("data-pp-src");
      if (src) el.setAttribute("src", src);
    }
  }
}

/** Remove first-party cookies of a withdrawn category (prefix match, every parent domain). */
function purge(cat: OptionalCategory): void {
  const list = (cfg.purge && cfg.purge[cat]) || [];
  for (const c of document.cookie.split("; ")) {
    const name = c.split("=")[0] || "";
    for (const prefix of list) {
      if (!prefix || name.indexOf(prefix) != 0) continue;
      const h = location.hostname.split(".");
      while (h.length > 1) {
        document.cookie = name + "=;path=/;max-age=0;domain=." + h.join(".");
        h.shift();
      }
      document.cookie = name + "=;path=/;max-age=0";
    }
  }
}

function decide(c: ConsentState, method: ConsentMethod, via?: "close"): void {
  const prev = state && state.c;
  state = {
    id: (state && state.id) || Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
    r: revision(),
    t: Date.now(),
    m: method,
    c: { ...c, necessary: true },
  };
  write(state);
  if (cfg.gcm !== false) gtag("consent", "update", gcmSignals(state.c));
  emit("consent", via ? { via } : undefined);
  hide();
  unblock();
  let withdrawn = false;
  for (const k of CATS) {
    if (prev && prev[k] && !state.c[k]) {
      withdrawn = true;
      try {
        purge(k);
      } catch (e) {
        // Cookie we can't delete from here (other path or HttpOnly).
      }
    }
  }
  if (withdrawn && cfg.reloadOnWithdraw) location.reload();
}

function css(): string {
  const th = cfg.theme || {};
  const right = cfg.side == "right";
  const font = th.font && th.font != "inherit" ? "font-family:" + th.font + ";" : "";
  return (
    ":host{--bg:" +
    (th.bg || "#fff") +
    ";--fg:" +
    (th.fg || "#0f172a") +
    ";--ac:" +
    (th.accent || "#0f766e") +
    ";--af:" +
    (th.accentFg || "#fff") +
    ";--bd:" +
    (th.border || "rgba(15,23,42,.12)") +
    ";--r:" +
    (th.radius == null ? 16 : th.radius) +
    "px;--br:" +
    (th.btnRadius == null ? 999 : th.btnRadius) +
    "px}" +
    "*{box-sizing:border-box;margin:0;padding:0}" +
    ".w{" +
    font +
    "font-size:" +
    (th.size || 14) +
    "px;line-height:1.5;color:var(--fg);letter-spacing:normal;text-align:left;font-weight:400;-webkit-font-smoothing:antialiased}" +
    ".b,.P,.R{position:fixed;z-index:2147483646;background:var(--bg);color:var(--fg);border:1px solid var(--bd);box-shadow:" +
    (th.shadow === false ? "none" : "0 18px 48px -16px rgba(15,23,42,.38)") +
    "}" +
    ".b{display:flex;gap:16px;align-items:center;border-radius:var(--r);animation:pi .4s cubic-bezier(.2,.8,.2,1)}" +
    ".h{font-weight:650;font-size:1.07em;margin-bottom:2px}.x{opacity:.82}.x a{color:inherit;text-decoration:underline;text-underline-offset:2px}" +
    ".a{display:flex;flex-wrap:wrap;gap:8px;flex-shrink:0}" +
    ".k{font:inherit;font-weight:600;font-size:.95em;line-height:1;padding:11px 18px;border-radius:var(--br);cursor:pointer;border:1px solid var(--bd);background:transparent;color:var(--fg);transition:transform .15s,opacity .15s,background .15s}" +
    ".k:hover{opacity:.88}.k:active{transform:scale(.97)}:focus-visible{outline:2px solid var(--ac);outline-offset:2px}" +
    ".p,.eq [data-a=reject]{background:var(--ac);color:var(--af);border-color:var(--ac)}" +
    ".soft .s{background:color-mix(in srgb,var(--fg) 8%,transparent);border-color:transparent}" +
    ".text .s{border-color:transparent;text-decoration:underline;text-underline-offset:3px;padding-inline:8px}" +
    ".pill{left:50%;bottom:18px;translate:-50% 0;width:min(780px,calc(100% - 24px));padding:12px 12px 12px 22px}" +
    ".bar{left:0;right:0;bottom:0;border-radius:0;border-width:1px 0 0;padding:16px max(20px,calc(50% - 560px))}" +
    ".bar .c,.pill .c{flex:1}" +
    ".corner{bottom:18px;" +
    (right ? "right" : "left") +
    ":18px;width:min(380px,calc(100% - 36px));padding:20px;flex-direction:column;align-items:stretch}" +
    ".corner .a .k,.modal .a .k{flex:1}" +
    ".modal,.P{top:50%;left:50%;translate:-50% -50%;width:min(520px,calc(100% - 28px));padding:24px;flex-direction:column;align-items:stretch;z-index:2147483647}" +
    ".o{position:fixed;inset:0;z-index:2147483646;background:rgba(15,23,42,.45);backdrop-filter:blur(2px);animation:fo .3s}" +
    ".P{display:flex;gap:14px;border-radius:var(--r);max-height:min(640px,calc(100% - 28px));overflow:auto;animation:pi .3s cubic-bezier(.2,.8,.2,1)}" +
    ".ph{display:flex;justify-content:space-between;align-items:center;gap:12px}" +
    ".X{font:inherit;font-size:20px;line-height:1;width:32px;height:32px;border-radius:999px;border:0;background:color-mix(in srgb,var(--fg) 7%,transparent);color:var(--fg);cursor:pointer}" +
    ".bx{position:absolute;top:8px;right:8px;flex-shrink:0}.hx .h{padding-right:32px}.pill .bx,.bar .bx{position:static}" +
    ".ct{border:1px solid var(--bd);border-radius:calc(var(--r)*.7);padding:12px 14px}.ct+.ct{margin-top:8px}" +
    ".r{display:flex;gap:12px;align-items:center;justify-content:space-between;cursor:pointer}.r b{display:block;font-weight:600}.r small{display:block;opacity:.75;font-size:.9em}" +
    ".on{font-size:.8em;font-weight:600;color:var(--ac);white-space:nowrap}" +
    "input{appearance:none;-webkit-appearance:none;flex-shrink:0;width:40px;height:24px;border-radius:99px;background:color-mix(in srgb,var(--fg) 22%,transparent);position:relative;cursor:pointer;transition:background .2s}" +
    "input:before{content:'';position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .2s}" +
    "input:checked{background:var(--ac)}input:checked:before{transform:translateX(16px)}" +
    ".sv{list-style:none;margin-top:8px;font-size:.85em;opacity:.8;display:grid;gap:2px}.sv li:before{content:'· '}" +
    ".R{bottom:16px;" +
    (right ? "right" : "left") +
    ":16px;width:44px;height:44px;border-radius:999px;display:grid;place-items:center;cursor:pointer;color:var(--ac);animation:fo .3s}" +
    "@keyframes pi{from{opacity:0;transform:translateY(14px)}}@keyframes fo{from{opacity:0}}" +
    "@media(max-width:640px){.pill,.corner{left:8px;right:8px;bottom:8px;width:auto;translate:none;flex-direction:column;align-items:stretch;padding:16px}.a .k{flex:1 1 40%}.bar{flex-direction:column;align-items:stretch}.pill .bx,.bar .bx{position:absolute}}" +
    "@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}"
  );
}

function onClick(e: Event): void {
  const el = e.target as Element | null;
  const b = el && el.closest ? el.closest("[data-a]") : null;
  if (b) act(b.getAttribute("data-a") || "");
}

function onKey(e: Event): void {
  if ((e as KeyboardEvent).key != "Escape" || !root) return;
  if (root.querySelector(".P")) act("close");
  else if (hasX() && root.querySelector(".b")) act("dismiss");
}

function onFocusIn(e: Event): void {
  const r = (e as FocusEvent).relatedTarget as HTMLElement | null;
  if (r && root && !root.contains(r)) back = r;
}

function onFocusOut(e: Event): void {
  const r = (e as FocusEvent).relatedTarget as HTMLElement | null;
  if (r && root && !root.contains(r) && !dlg()) back = null;
}

function unmount(): void {
  document.removeEventListener("keydown", trap, true);
  if (host && host.parentNode) host.parentNode.removeChild(host);
  host = root = null;
}

function mount(): void {
  unmount();
  host = document.createElement("div");
  host.id = "privacypill";
  const r: Root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
  root = r;
  document.body.insertBefore(host, document.body.firstChild);
  r.addEventListener("click", onClick);
  r.addEventListener("keydown", onKey);
  r.addEventListener("focusin", onFocusIn);
  r.addEventListener("focusout", onFocusOut);
  // On the document, so Tab from the page behind an open dialog is caught too.
  document.addEventListener("keydown", trap, true);
}

/** The open dialog that holds focus: the preferences panel or the modal banner. */
function dlg(): HTMLElement | null {
  if (!root || !host || !host.isConnected) return null;
  return root.querySelector<HTMLElement>(".P") || root.querySelector<HTMLElement>(".modal");
}

/** Tab and Shift+Tab cycle inside an open dialog; Tab from the page behind it comes back in. */
function trap(e: KeyboardEvent): void {
  const p = e.key == "Tab" ? dlg() : null;
  if (!p) return;
  const f = Array.from(p.querySelectorAll<HTMLElement>(FOCUSABLE));
  const i = f.indexOf(((root as ShadowRoot).activeElement || document.activeElement) as HTMLElement);
  if (i < 0 || i == (e.shiftKey ? 0 : f.length - 1)) {
    const next = e.shiftKey ? f[f.length - 1] : f[0];
    if (next) next.focus();
    e.preventDefault();
  }
}

function foc(el: HTMLElement | null | undefined): void {
  if (el && el.isConnected && el.focus) {
    try {
      el.focus();
    } catch (e) {
      // Element can't take focus right now.
    }
  }
}

function refocus(el?: HTMLElement | null): void {
  foc(el || back);
  back = null;
}

/** focus: a selector to focus, or 1 for the open dialog's first control in reading order. */
function render(html: string, focus?: string | 1): void {
  if (!root) return;
  root.innerHTML =
    "<style>" +
    css() +
    "</style><div class='w " +
    ((cfg.theme && cfg.theme.buttons) || "outline") +
    (cfg.equal !== false ? " eq" : "") +
    "'>" +
    html +
    "</div>";
  const p = dlg();
  foc(focus == 1 ? p && p.querySelector<HTMLElement>(FOCUSABLE) : focus ? root.querySelector<HTMLElement>(focus) : null);
}

function buttons(prefs?: boolean): string {
  return (
    "<div class='a'>" +
    (prefs ? "" : "<button class='k s' data-a='customize'>" + esc(t.customize) + "</button>") +
    "<button class='k s' data-a='reject'>" +
    esc(t.reject) +
    "</button>" +
    (prefs ? "<button class='k s' data-a='save'>" + esc(t.save) + "</button>" : "") +
    "<button class='k p' data-a='accept'>" +
    esc(t.accept) +
    "</button></div>"
  );
}

function policyLink(): string {
  const u = cfg.policyUrl;
  return u && /^(https?:\/\/|\/)/.test(u)
    ? " <a href='" + esc(u) + "' target='_blank' rel='noopener'>" + esc(t.policy) + "</a>"
    : "";
}

/** X on the first layer (as Italy's Garante describes): closing keeps only necessary cookies. */
function closeButton(): string {
  const label = esc(t.dismiss || t.close);
  return hasX()
    ? "<button class='X bx' data-a='dismiss' aria-label='" + label + "' title='" + label + "'>&times;</button>"
    : "";
}

/** ret: coming back from the preferences panel without a decision. */
function showBanner(ret?: boolean): void {
  if (!root) return;
  const layout = cfg.layout || "pill";
  const modal = layout == "modal";
  const focus = ret && from == "customize" ? "[data-a=customize]" : modal ? 1 : "";
  render(
    (modal ? "<div class='o'></div>" : "") +
      "<div class='b " +
      layout +
      (hasX() ? " hx" : "") +
      "' role='dialog' aria-modal='" +
      modal +
      "' aria-labelledby='ppt' aria-describedby='ppx'><div class='c'><p class='h' id='ppt'>" +
      esc(t.title) +
      "</p><p class='x' id='ppx'>" +
      esc(t.body) +
      policyLink() +
      "</p></div>" +
      buttons() +
      closeButton() +
      "</div>",
    focus,
  );
  // Preferences the page opened over a non-modal banner: hand focus back to the page.
  if (ret && !focus) refocus();
  from = null;
  emit("show", { view: "banner" });
}

function openPrefs(src?: string): void {
  if (!root) return;
  const a = (root as ShadowRoot).activeElement;
  from = src || (a && a.getAttribute("data-a")) || null;
  const c = state ? state.c : all(false);
  const cats: Category[] = ["necessary"];
  for (const k of CATS) if (!cfg.categories || cfg.categories[k] !== false) cats.push(k);
  let rows = "";
  for (const k of cats) {
    const ct = t[k] || { name: k, desc: "" };
    const sv = (cfg.services && cfg.services[k]) || [];
    rows +=
      "<div class='ct'><label class='r'><span><b>" +
      esc(ct.name) +
      "</b><small>" +
      esc(ct.desc) +
      "</small></span>" +
      (k == "necessary"
        ? "<span class='on'>" + esc(t.alwaysOn) + "</span>"
        : "<input type='checkbox' role='switch' data-c='" +
          k +
          "'" +
          (c[k] ? " checked" : "") +
          " aria-label='" +
          esc(ct.name) +
          "'>") +
      "</label>" +
      (sv.length ? "<ul class='sv'>" + sv.map((s) => "<li>" + esc(s) + "</li>").join("") + "</ul>" : "") +
      "</div>";
  }
  render(
    "<div class='o' data-a='close'></div><div class='P' role='dialog' aria-modal='true' aria-labelledby='ppp' aria-describedby='ppq'>" +
      "<div class='ph'><p class='h' id='ppp'>" +
      esc(t.prefsTitle) +
      "</p><button class='X' data-a='close' aria-label='" +
      esc(t.close) +
      "'>&times;</button></div><p class='x' id='ppq'>" +
      esc(t.prefsBody) +
      policyLink() +
      "</p><div>" +
      rows +
      "</div>" +
      buttons(true) +
      "</div>",
    1,
  );
  emit("show", { view: "preferences" });
}

function reopenButton(): void {
  if (!root) return;
  if (cfg.reopen === false) return render("");
  render(
    "<button class='R' data-a='open' aria-label='" +
      esc(t.settings) +
      "' title='" +
      esc(t.settings) +
      "'><svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5'/><path d='M8.5 8.5v.01M16 15.5v.01M12 12v.01M11 17v.01M7 14v.01'/></svg></button>",
  );
}

/**
 * Focus goes back where it was: the reopen button if the panel was opened from it, otherwise the
 * page element focus came from. Only when we held focus (a dialog was open or the visitor was in
 * the banner), so a mouse click or an API call never moves the page's focus.
 */
function hide(): void {
  const give = !!root && !!host && (!!dlg() || host.contains(document.activeElement));
  reopenButton();
  if (give) refocus(from == "open" && root ? root.querySelector<HTMLElement>(".R") : null);
  from = null;
  emit("hide");
}

function act(a: string): void {
  if (a == "accept") decide(all(true), "accept");
  else if (a == "reject") decide(all(false), "reject");
  else if (a == "dismiss") decide(all(false), "reject", "close");
  else if (a == "customize" || a == "open") openPrefs(a);
  else if (a == "save") {
    const c = all(false);
    if (root)
      for (const inp of Array.from(root.querySelectorAll<HTMLInputElement>("input[data-c]")))
        c[inp.getAttribute("data-c") as OptionalCategory] = inp.checked;
    decide(c, "custom");
  } else if (a == "close") state ? hide() : showBanner(true);
}

/** Built-in texts plus the site's own wording, per language. */
function textTable(): Locales {
  const base: Locales = { ...defaults, ...cfg.locales };
  const own = cfg.texts || {};
  const only = cfg.languages;
  const out: Locales = {};
  for (const code of Object.keys(base).concat(Object.keys(own))) {
    if (out[code] || (only && only.indexOf(code) < 0)) continue;
    const b = base[code] || base["en"] || en;
    const o = own[code] || {};
    out[code] = {
      ...b,
      ...o,
      necessary: { ...b.necessary, ...o.necessary },
      analytics: { ...b.analytics, ...o.analytics },
      marketing: { ...b.marketing, ...o.marketing },
      functional: { ...b.functional, ...o.functional },
    } as BannerTexts;
  }
  return out;
}

function pickLang(T: Locales): string {
  const list = [document.documentElement.lang].concat(
    navigator.languages && navigator.languages.length ? Array.from(navigator.languages) : [navigator.language],
  );
  if (cfg.autoLang !== false)
    for (const l of list) {
      const code = String(l || "").slice(0, 2).toLowerCase();
      if (T[code]) return code;
    }
  return cfg.lang && T[cfg.lang] ? cfg.lang : T["en"] ? "en" : Object.keys(T)[0] || "en";
}

function whenReady(fn: () => void): void {
  if (document.readyState == "loading") document.addEventListener("DOMContentLoaded", fn);
  else fn();
}

function init(c?: ConsentBannerConfig): ConsentBannerApi {
  cfg = c || {};
  const T = textTable();
  t = T[pickLang(T)] || en;
  const s = read();
  state = s && typeof s == "object" && s.c && s.r === revision() ? s : null;
  if (cfg.gcm !== false) {
    if (!booted) {
      if (cfg.redact !== false) gtag("set", "ads_data_redaction", true);
      if (cfg.passthrough) gtag("set", "url_passthrough", true);
      // Respect a fail-safe default that was already pushed inline before this script.
      let had = false;
      for (const e of layer()) {
        const x = e as ArrayLike<unknown> | null;
        if (x && x[0] == "consent" && x[1] == "default") had = true;
      }
      if (!had) gtag("consent", "default", { ...gcmSignals(all(false)), wait_for_update: cfg.wait == null ? 500 : cfg.wait });
    }
    // Re-init without a stored choice: bring Google tags back to denied.
    else if (!state) gtag("consent", "update", gcmSignals(all(false)));
    if (state) gtag("consent", "update", gcmSignals(state.c));
  }
  booted = true;
  emit("ready");
  whenReady(() => {
    mount();
    unblock();
    if (state) reopenButton();
    else showBanner();
  });
  return api;
}

export const api: ConsentBannerApi = {
  version: VERSION,
  v: VERSION,
  init,
  open: () => openPrefs(),
  show: () => showBanner(),
  accept: () => decide(all(true), "accept"),
  reject: () => decide(all(false), "reject"),
  set(consent) {
    const n = all(false);
    for (const k of CATS) n[k] = !!(consent && consent[k]);
    decide(n, "api");
  },
  get: () => (state ? { ...state.c } : null),
  allowed,
  on(listener) {
    subs.push(listener);
    return () => {
      subs = subs.filter((s) => s !== listener);
    };
  },
  reset() {
    state = null;
    write(null);
    if (cfg.gcm !== false) gtag("consent", "update", gcmSignals(all(false)));
    emit("reset");
    showBanner();
  },
  destroy() {
    unmount();
    back = from = null;
  },
};

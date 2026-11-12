import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { de, locales } from "../src/locales.js";
import type { ConsentEventDetail } from "../src/types.js";
import {
  active,
  boot,
  closeX,
  consentCalls,
  control,
  dataLayerEvents,
  dialog,
  gtagCalls,
  load,
  panelClose,
  press,
  resetPage,
  shadow,
  storedChoice,
  w,
} from "./helpers.js";

beforeEach(resetPage);
afterEach(resetPage);

describe("Google Consent Mode v2", () => {
  it("starts with every optional signal denied, security_storage granted, before any choice", async () => {
    await boot();
    expect(consentCalls("default")).toEqual([
      {
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
        analytics_storage: "denied",
        functionality_storage: "denied",
        personalization_storage: "denied",
        security_storage: "granted",
        wait_for_update: 500,
      },
    ]);
    expect(gtagCalls()).toContainEqual(["set", "ads_data_redaction", true]);
  });

  it("keeps a fail-safe default that was pushed inline before the script", async () => {
    w.dataLayer = [["consent", "default", { ad_storage: "denied" }]];
    await boot();
    expect(consentCalls("default")).toHaveLength(1);
  });

  it("grants ad_storage, ad_user_data, ad_personalization and analytics_storage on Accept all", async () => {
    await boot();
    control("accept").click();
    expect(consentCalls("update").at(-1)).toMatchObject({
      ad_storage: "granted",
      ad_user_data: "granted",
      ad_personalization: "granted",
      analytics_storage: "granted",
      functionality_storage: "granted",
      personalization_storage: "granted",
    });
  });

  it("keeps all four ad and analytics signals denied on Reject", async () => {
    await boot();
    control("reject").click();
    expect(consentCalls("update").at(-1)).toMatchObject({
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "denied",
    });
  });

  it("maps analytics-only consent to analytics_storage without any ad signal", async () => {
    (await boot()).set({ analytics: true });
    const last = consentCalls("update").at(-1);
    expect(last).toMatchObject({ analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied" });
  });

  it("re-applies a returning visitor's choice straight after the default", async () => {
    (await boot()).accept();
    w.dataLayer = [];
    delete w.PrivacyPill;
    await boot();
    expect(consentCalls("default")).toHaveLength(1);
    expect(consentCalls("update")).toEqual([expect.objectContaining({ analytics_storage: "granted" })]);
  });

  it("sends nothing to Google tags when gcm is false", async () => {
    (await boot({ gcm: false })).accept();
    expect(gtagCalls()).toEqual([]);
  });

  it("pushes privacypill_* events with the category flags for GTM triggers", async () => {
    (await boot()).set({ marketing: true });
    expect(dataLayerEvents().find((e) => e.event == "privacypill_consent")).toEqual({
      event: "privacypill_consent",
      privacypill: { analytics: "denied", marketing: "granted", functional: "denied" },
    });
  });
});

describe("the stored choice", () => {
  it("is a first-party cookie with the method, categories and revision", async () => {
    await boot();
    control("reject").click();
    expect(storedChoice()).toMatchObject({
      r: 1,
      m: "reject",
      c: { necessary: true, analytics: false, marketing: false, functional: false },
    });
  });

  it("is remembered: a returning visitor sees only the reopen button", async () => {
    (await boot()).accept();
    delete w.PrivacyPill;
    const pp = await boot();
    expect(dialog()).toBeNull();
    expect(shadow()!.querySelector("[data-a=open]")).not.toBeNull();
    expect(pp.get()).toEqual({ necessary: true, analytics: true, marketing: true, functional: true });
  });

  it("asks again after the revision is bumped", async () => {
    (await boot()).accept();
    delete w.PrivacyPill;
    const pp = await boot({ revision: 2 });
    expect(pp.get()).toBeNull();
    expect(dialog()).not.toBeNull();
  });

  it("asks again when the cookie can't be read", async () => {
    document.cookie = "pp_consent=%7Bnot-json;path=/";
    const pp = await boot();
    expect(pp.get()).toBeNull();
    expect(dialog()).not.toBeNull();
  });

  it("uses a custom cookie name", async () => {
    (await boot({ cookieName: "my_consent" })).reject();
    expect(storedChoice("my_consent")?.m).toBe("reject");
    expect(storedChoice()).toBeNull();
  });

  it("keeps the same id when the visitor changes their mind", async () => {
    const pp = await boot();
    pp.accept();
    const id = storedChoice()!.id;
    pp.reject();
    expect(storedChoice()!.id).toBe(id);
  });

  it("reset() forgets the choice, denies the signals and shows the banner again", async () => {
    const pp = await boot();
    pp.accept();
    pp.reset();
    expect(pp.get()).toBeNull();
    expect(storedChoice()).toBeNull();
    expect(consentCalls("update").at(-1)).toMatchObject({ analytics_storage: "denied", ad_storage: "denied" });
    expect(dialog()).not.toBeNull();
  });
});

describe("categories and the preferences panel", () => {
  const switches = () => Array.from(shadow()!.querySelectorAll<HTMLInputElement>("input[data-c]"));

  it("shows strictly necessary as always on and every other category switched off", async () => {
    await boot();
    control("customize").click();
    expect(shadow()!.querySelector(".on")?.textContent).toBe("Always on");
    expect(switches().map((s) => [s.dataset["c"], s.checked])).toEqual([
      ["analytics", false],
      ["marketing", false],
      ["functional", false],
    ]);
  });

  it("leaves out categories the site doesn't use", async () => {
    await boot({ categories: { functional: false } });
    control("customize").click();
    expect(switches().map((s) => s.dataset["c"])).toEqual(["analytics", "marketing"]);
  });

  it("saves exactly the switched-on categories", async () => {
    const pp = await boot();
    control("customize").click();
    switches()[0]!.checked = true;
    control("save").click();
    expect(pp.get()).toEqual({ necessary: true, analytics: true, marketing: false, functional: false });
    expect(storedChoice()?.m).toBe("custom");
  });

  it("shows the current choice when reopened", async () => {
    const pp = await boot();
    pp.set({ marketing: true });
    pp.open();
    expect(switches().map((s) => s.checked)).toEqual([false, true, false]);
  });

  it("lists the services in each category", async () => {
    await boot({ services: { analytics: ["Plausible", "Matomo"] } });
    control("customize").click();
    expect(Array.from(shadow()!.querySelectorAll(".sv li")).map((li) => li.textContent)).toEqual(["Plausible", "Matomo"]);
  });

  it("allowed() follows the choice and always allows necessary", async () => {
    const pp = await boot();
    expect(pp.allowed("necessary")).toBe(true);
    expect(pp.allowed("analytics")).toBe(false);
    pp.set({ analytics: true });
    expect(pp.allowed("analytics")).toBe(true);
    expect(pp.allowed("marketing")).toBe(false);
  });

  it("set() ignores unknown categories", async () => {
    const pp = await boot();
    pp.set({ analytics: true, ...({ tracking: true } as object) });
    expect(pp.get()).toEqual({ necessary: true, analytics: true, marketing: false, functional: false });
  });
});

describe("script blocking with data attributes", () => {
  const page = () => {
    document.body.innerHTML = `
      <script type="text/plain" data-pp-category="analytics" id="a">window.__a = 1</script>
      <script type="text/plain" data-pp-category="marketing" data-pp-type="module" id="m" src="/ads.js"></script>
      <iframe data-pp-category="functional" data-pp-src="/embed.html" id="f"></iframe>`;
  };
  const el = (id: string) => document.getElementById(id)!;

  it("keeps every blocked script and embed inert until its category is allowed", async () => {
    page();
    await boot();
    expect(el("a").getAttribute("type")).toBe("text/plain");
    expect(el("m").getAttribute("type")).toBe("text/plain");
    expect(el("f").hasAttribute("src")).toBe(false);
  });

  it("activates only the allowed category", async () => {
    page();
    (await boot()).set({ analytics: true });
    expect(el("a").getAttribute("type")).toBe("text/javascript");
    expect(el("a").textContent).toBe("window.__a = 1");
    expect(el("m").getAttribute("type")).toBe("text/plain");
    expect(el("f").hasAttribute("src")).toBe(false);
  });

  it("activates everything on Accept all, keeping data-pp-type and src", async () => {
    page();
    (await boot()).accept();
    expect(el("m").getAttribute("type")).toBe("module");
    expect(el("m").getAttribute("src")).toBe("/ads.js");
    expect(el("f").getAttribute("src")).toBe("/embed.html");
  });

  it("activates blocked scripts on load for a returning visitor who allowed them", async () => {
    (await boot()).accept();
    delete w.PrivacyPill;
    page();
    await boot();
    expect(el("a").getAttribute("type")).toBe("text/javascript");
  });

  it("keeps blocked scripts blocked after Reject and after closing with the X", async () => {
    page();
    await boot();
    closeX()!.click();
    expect(el("a").getAttribute("type")).toBe("text/plain");
    control("open").click();
    control("reject").click();
    expect(el("m").getAttribute("type")).toBe("text/plain");
  });

  it("keeps the CSP nonce on activated scripts", async () => {
    document.body.innerHTML = `<script type="text/plain" data-pp-category="analytics" id="n">1</script>`;
    (el("n") as HTMLScriptElement).nonce = "abc123";
    (await boot()).accept();
    expect((el("n") as HTMLScriptElement).nonce).toBe("abc123");
  });

  it("deletes first-party cookies of a withdrawn category", async () => {
    const pp = await boot({ purge: { analytics: ["_ga"] } });
    pp.accept();
    document.cookie = "_ga=GA1.1.123;path=/";
    document.cookie = "_ga_ABC=GS1.1;path=/";
    document.cookie = "keep=1;path=/";
    pp.set({ marketing: true });
    expect(document.cookie).not.toMatch(/_ga/);
    expect(document.cookie).toMatch(/keep=1/);
  });
});

describe("close X on the first layer", () => {
  it("is shown and labelled by default", async () => {
    await boot();
    expect(closeX()?.getAttribute("aria-label")).toBe("Close without accepting");
    expect(closeX()?.closest("[role=dialog]")).not.toBeNull();
  });

  it.each(["pill", "bar", "modal", "corner"] as const)("is shown in the %s layout", async (layout) => {
    await boot({ layout });
    expect(closeX()).not.toBeNull();
  });

  it("is left out with closeX: false", async () => {
    await boot({ closeX: false });
    expect(dialog()).not.toBeNull();
    expect(closeX()).toBeNull();
  });

  it("counts as Reject: every signal denied, stored as a refusal, marked as closed", async () => {
    let detail: ConsentEventDetail | undefined;
    const listen = (e: CustomEvent<ConsentEventDetail>) => (detail = e.detail);
    window.addEventListener("privacypill:consent", listen);
    try {
      const pp = await boot();
      closeX()!.click();
      expect(pp.get()).toEqual({ necessary: true, analytics: false, marketing: false, functional: false });
    } finally {
      window.removeEventListener("privacypill:consent", listen);
    }
    expect(consentCalls("update").at(-1)).toMatchObject({
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "denied",
    });
    expect(storedChoice()?.m).toBe("reject");
    expect(detail).toMatchObject({ method: "reject", via: "close", decided: true });
    expect(dialog()).toBeNull();
  });

  it("Escape closes the banner the same way", async () => {
    const pp = await boot();
    press(closeX()!, "Escape");
    expect(pp.get()).toMatchObject({ analytics: false, marketing: false });
    expect(storedChoice()?.m).toBe("reject");
  });

  it("Escape does nothing on a banner without the X", async () => {
    const pp = await boot({ closeX: false });
    press(dialog()!, "Escape");
    expect(pp.get()).toBeNull();
  });

  it("the X on the preferences panel goes back to the banner without deciding", async () => {
    const pp = await boot();
    control("customize").click();
    panelClose().click();
    expect(pp.get()).toBeNull();
    expect(closeX()).not.toBeNull();
  });
});

describe("keyboard focus", () => {
  const page = () => {
    document.body.innerHTML = `<button id="opener">Cookie settings</button><input id="search">`;
    return {
      opener: document.getElementById("opener") as HTMLButtonElement,
      search: document.getElementById("search") as HTMLInputElement,
    };
  };

  it("the modal starts on Customise, never on Accept all", async () => {
    await boot({ layout: "modal" });
    expect(active()).toBe(control("customize"));
  });

  it("the modal starts on the policy link when there is one, because it comes first", async () => {
    await boot({ layout: "modal", policyUrl: "/privacy" });
    expect(active()?.getAttribute("href")).toBe("/privacy");
  });

  it.each(["pill", "bar", "corner"] as const)("the %s layout doesn't take focus or trap Tab", async (layout) => {
    await boot({ layout });
    expect(document.activeElement).toBe(document.body);
    const last = control("dismiss");
    last.focus();
    expect(press(last, "Tab").defaultPrevented).toBe(false);
  });

  it("the preferences panel starts on its close button, not on a switch", async () => {
    await boot();
    control("customize").click();
    expect(active()).toBe(panelClose());
  });

  it("Tab wraps from the last control to the first and Shift+Tab back", async () => {
    await boot({ layout: "modal" });
    const first = control("customize");
    const last = control("dismiss");
    last.focus();
    expect(press(last, "Tab").defaultPrevented).toBe(true);
    expect(active()).toBe(first);
    expect(press(first, "Tab", true).defaultPrevented).toBe(true);
    expect(active()).toBe(last);
  });

  it("Tab moves normally between controls in the middle", async () => {
    await boot({ layout: "modal" });
    expect(press(control("reject"), "Tab").defaultPrevented).toBe(false);
  });

  it("Tab from the page behind the modal brings focus back into it", async () => {
    const { search } = page();
    await boot({ layout: "modal" });
    search.focus();
    press(search, "Tab");
    expect(active()).toBe(control("customize"));
    search.focus();
    press(search, "Tab", true);
    expect(active()).toBe(control("dismiss"));
  });

  it.each(["pill", "modal"] as const)("keeps focus inside the preferences panel (%s)", async (layout) => {
    await boot({ layout });
    control("customize").click();
    press(panelClose(), "Tab", true);
    expect(active()).toBe(control("accept"));
    press(control("accept"), "Tab");
    expect(active()).toBe(panelClose());
  });

  it("stops trapping once the banner is removed from the page", async () => {
    const { search } = page();
    await boot({ layout: "modal" });
    document.getElementById("privacypill")!.remove();
    search.focus();
    expect(press(search, "Tab").defaultPrevented).toBe(false);
  });

  it.each(["accept", "reject", "dismiss"])("after %s in the modal, focus returns to where it was", async (choice) => {
    const { opener } = page();
    opener.focus();
    await boot({ layout: "modal" });
    control(choice).click();
    expect(document.activeElement).toBe(opener);
  });

  it("closing the preferences panel returns focus to Customise", async () => {
    await boot();
    control("customize").focus();
    control("customize").click();
    press(panelClose(), "Escape");
    expect(active()).toBe(control("customize"));
  });

  it("preferences opened by the page hand focus back to the page", async () => {
    const { opener } = page();
    const pp = await boot();
    opener.focus();
    pp.open();
    expect(active()).toBe(panelClose());
    press(panelClose(), "Escape");
    expect(document.activeElement).toBe(opener);
  });

  it("preferences opened from the reopen button return focus to it", async () => {
    const pp = await boot();
    pp.accept();
    const reopen = () => control("open");
    reopen().focus();
    reopen().click();
    control("save").click();
    expect(active()).toBe(reopen());
  });

  it("a choice made by the page doesn't move the visitor's focus", async () => {
    const { search } = page();
    const pp = await boot();
    search.focus();
    pp.accept();
    expect(document.activeElement).toBe(search);
  });

  it("switches have role=switch and the dialog is labelled", async () => {
    await boot();
    control("customize").click();
    const p = shadow()!.querySelector(".P")!;
    expect(p.getAttribute("aria-modal")).toBe("true");
    expect(shadow()!.getElementById(p.getAttribute("aria-labelledby")!)?.textContent).toBe("Privacy preferences");
    expect(shadow()!.querySelectorAll("input[role=switch]")).toHaveLength(3);
  });
});

describe("languages and texts", () => {
  it("ESM builds speak English unless more languages are passed in", async () => {
    document.documentElement.lang = "de";
    await boot();
    expect(shadow()!.querySelector("#ppt")?.textContent).toBe("We value your privacy");
  });

  it("picks the page's language from the languages passed in", async () => {
    document.documentElement.lang = "de-AT";
    await boot({ locales: { de } });
    expect(shadow()!.querySelector("#ppt")?.textContent).toBe(de.title);
    expect(closeX()?.getAttribute("aria-label")).toBe("Ohne Zustimmung schließen");
  });

  it("falls back to lang when the visitor's language isn't available", async () => {
    document.documentElement.lang = "pl";
    Object.defineProperty(navigator, "languages", { configurable: true, value: ["pl-PL"] });
    try {
      await boot({ locales, lang: "fr" });
      expect(shadow()!.querySelector("#ppt")?.textContent).toBe(locales["fr"]!.title);
    } finally {
      delete (navigator as { languages?: unknown }).languages;
    }
  });

  it("autoLang: false always uses lang", async () => {
    document.documentElement.lang = "de";
    await boot({ locales, lang: "nl", autoLang: false });
    expect(shadow()!.querySelector("#ppt")?.textContent).toBe(locales["nl"]!.title);
  });

  it("merges your own wording over the built-in texts", async () => {
    await boot({ texts: { en: { title: "Cookies?", analytics: { name: "Stats" } } } });
    expect(shadow()!.querySelector("#ppt")?.textContent).toBe("Cookies?");
    expect(control("accept").textContent).toBe("Accept all");
    control("customize").click();
    expect(shadow()!.querySelector("[data-c=analytics]")?.getAttribute("aria-label")).toBe("Stats");
  });

  it("escapes texts, so wording can't inject markup", async () => {
    await boot({ texts: { en: { title: `<img src=x onerror="alert(1)">` } } });
    expect(shadow()!.querySelector("img")).toBeNull();
    expect(shadow()!.querySelector("#ppt")?.textContent).toBe(`<img src=x onerror="alert(1)">`);
  });

  it("only links a policy URL that is https:// or a path", async () => {
    await boot({ policyUrl: "javascript:alert(1)" });
    expect(shadow()!.querySelector("a")).toBeNull();
    delete w.PrivacyPill;
    await boot({ policyUrl: "https://example.com/cookies" });
    expect(shadow()!.querySelector("a")?.getAttribute("href")).toBe("https://example.com/cookies");
  });
});

describe("events and API", () => {
  it("on() receives ready, show and consent, and can stop listening", async () => {
    const { initConsentBanner } = await load();
    const seen: string[] = [];
    const pp = initConsentBanner();
    const off = pp.on((d) => seen.push(d.type + (d.view ? ":" + d.view : "")));
    pp.open();
    pp.accept();
    off();
    pp.reject();
    expect(seen).toEqual(["show:preferences", "consent", "hide"]);
  });

  it("dispatches privacypill:consent with Consent Mode signals", async () => {
    const pp = await boot();
    const got = new Promise<ConsentEventDetail>((resolve) =>
      window.addEventListener("privacypill:consent", (e) => resolve(e.detail), { once: true }),
    );
    pp.set({ analytics: true });
    expect((await got).gcm).toMatchObject({ analytics_storage: "granted", ad_storage: "denied" });
  });

  it("one failing listener doesn't stop the others", async () => {
    const pp = await boot();
    const ok = vi.fn();
    pp.on(() => {
      throw new Error("boom");
    });
    pp.on(ok);
    pp.accept();
    expect(ok).toHaveBeenCalled();
  });

  it("exposes window.PrivacyPill for Cookie settings links, and getConsentBanner()", async () => {
    const mod = await load();
    expect(mod.getConsentBanner()).toBeUndefined();
    const pp = mod.initConsentBanner();
    expect(w.PrivacyPill).toBe(pp);
    expect(mod.getConsentBanner()).toBe(pp);
  });

  it("doesn't start a second banner when another PrivacyPill script is on the page", async () => {
    const other = { v: "9.9.9" } as unknown as NonNullable<typeof w.PrivacyPill>;
    w.PrivacyPill = other;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(await boot()).toBe(other);
      expect(document.getElementById("privacypill")).toBeNull();
    } finally {
      warn.mockRestore();
    }
  });

  it("init() again restarts with the new config and keeps a single Consent Mode default", async () => {
    const pp = await boot({ layout: "bar" });
    pp.init({ layout: "corner" });
    expect(shadow()!.querySelector(".b")?.classList.contains("corner")).toBe(true);
    expect(document.querySelectorAll("#privacypill")).toHaveLength(1);
    expect(consentCalls("default")).toHaveLength(1);
  });

  it("destroy() removes the banner but keeps the choice", async () => {
    const pp = await boot();
    pp.accept();
    pp.destroy();
    expect(document.getElementById("privacypill")).toBeNull();
    expect(storedChoice()?.m).toBe("accept");
  });

  it("waits for the DOM when started from <head>", async () => {
    const state = vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
    try {
      await boot();
      expect(document.getElementById("privacypill")).toBeNull();
      state.mockReturnValue("interactive");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      expect(dialog()).not.toBeNull();
    } finally {
      state.mockRestore();
    }
  });

  it("throws a clear error outside the browser", async () => {
    const { initConsentBanner } = await load();
    const win = globalThis.window;
    vi.stubGlobal("window", undefined);
    try {
      expect(() => initConsentBanner()).toThrow(/browser/);
    } finally {
      vi.stubGlobal("window", win);
      vi.unstubAllGlobals();
    }
  });
});

describe("works offline", () => {
  it("makes no network request through a whole visit", async () => {
    const fetchSpy = vi.fn();
    const beacon = vi.fn();
    const xhr = vi.spyOn(XMLHttpRequest.prototype, "open");
    vi.stubGlobal("fetch", fetchSpy);
    Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: beacon });
    try {
      const pp = await boot({ policyUrl: "/privacy", layout: "modal" });
      control("customize").click();
      control("save").click();
      pp.open();
      control("accept").click();
      pp.reset();
      closeX()!.click();
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(beacon).not.toHaveBeenCalled();
      expect(xhr).not.toHaveBeenCalled();
      // Nothing the banner renders points anywhere but your own page.
      expect(shadow()!.querySelectorAll("[src],link,script,img,iframe")).toHaveLength(0);
    } finally {
      vi.unstubAllGlobals();
      xhr.mockRestore();
      delete (navigator as { sendBeacon?: unknown }).sendBeacon;
    }
  });
});

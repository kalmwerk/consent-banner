# @kalmwerk/consent-banner

A free, MIT-licensed cookie consent banner for any website. No dependencies, no build step, no account and **no calls home**: the visitor's choice stays in a first-party cookie on your own domain, and the script only talks to your page (and to Google tags through `window.dataLayer`, if you use them).

- **Accept all and Reject side by side**, equally prominent by default.
- **Close X counts as Reject**, so closing the banner never grants anything.
- **Categories**: strictly necessary (always on), analytics, marketing and functional. Nothing is pre-ticked.
- **Google Consent Mode v2**: denied defaults before any tag runs, then an update on every choice (`ad_storage`, `ad_user_data`, `ad_personalization`, `analytics_storage`, plus `functionality_storage` and `personalization_storage`).
- **Script and iframe blocking** with data attributes, including inline scripts, `type="module"` and CSP nonces.
- **Keyboard and screen readers**: labelled dialogs, focus trapped while a dialog is open, focus starts on Customise (never on Accept) and goes back to where the visitor was.
- **Six languages** (English, German, French, Dutch, Spanish, Italian), picked from the page or the browser.
- **Four layouts** (floating pill, bottom bar, modal, corner), themed through config, rendered in Shadow DOM so your CSS can't break it.
- **Small**: about 8 kB gzipped as a single script with all six languages, about 6 kB as an ES module with English only.

> Want a visual editor, hosted config, consent logs and a cookie scan? [PrivacyPill](https://privacy-pill-consent-studio.lovable.app) — the free plan covers one site; Pro and Lifetime are on a waitlist and open soon.

## Quick start

### Script tag (no build step)

1. Download `consent-banner.min.js` and upload it to your own site. Self-host it rather than loading it from a CDN, so no third party sees your visitors before they choose.
2. Add this to the top of `<head>`, **before** Google Tag Manager, gtag.js or any analytics:

```html
<!-- 1. Fail-safe: every Consent Mode signal starts denied, even if the banner loads late -->
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',functionality_storage:'denied',personalization_storage:'denied',security_storage:'granted',wait_for_update:500});</script>

<!-- 2. The banner -->
<script src="/consent-banner.min.js" data-config='{"policyUrl":"/privacy"}'></script>
```

3. Mark the scripts that need consent (see [Blocking scripts](#blocking-scripts-until-consent)).
4. Give visitors a way to change their mind, for example in your footer:

```html
<button type="button" onclick="PrivacyPill.open()">Cookie settings</button>
```

You can also configure the script with `window.PrivacyPillConfig = { ... }` set before it, or add `data-manual` and call `PrivacyPill.init({ ... })` yourself.

### npm

```sh
npm install @kalmwerk/consent-banner
```

```js
import { initConsentBanner } from "@kalmwerk/consent-banner";
import { de, fr, nl } from "@kalmwerk/consent-banner/locales";

initConsentBanner({ policyUrl: "/privacy", locales: { de, fr, nl } });
```

The ES module ships English only; import the other languages you need from `@kalmwerk/consent-banner/locales` (or `locales` for all six). Call `initConsentBanner()` in browser code. It also sets `window.PrivacyPill`, so plain `PrivacyPill.open()` links keep working.

Put the fail-safe snippet from step 2 in your HTML `<head>` as well; it is exported as `CONSENT_DEFAULTS_SNIPPET` if your framework renders the head for you.

React or Next.js (App Router):

```tsx
"use client";
import { useEffect } from "react";
import { initConsentBanner } from "@kalmwerk/consent-banner";

export function ConsentBanner() {
  useEffect(() => {
    initConsentBanner({ policyUrl: "/privacy" });
  }, []);
  return null;
}
```

Render `<ConsentBanner />` once in your root layout. Vue, Svelte, Astro and others work the same way: call it once from client-side code.

## Blocking scripts until consent

The banner only blocks what you mark. Change `type` to `text/plain` and name the category; the script runs as soon as that category is allowed, and straight away on later visits.

```html
<!-- Runs only after the visitor allows analytics -->
<script type="text/plain" data-pp-category="analytics" src="https://example.com/analytics.js"></script>

<!-- Inline scripts work too -->
<script type="text/plain" data-pp-category="marketing">
  fbq("init", "000000000000000");
</script>

<!-- Keep the real type with data-pp-type -->
<script type="text/plain" data-pp-category="functional" data-pp-type="module" src="/chat.js"></script>

<!-- Embeds: the iframe loads only after consent -->
<iframe data-pp-category="functional" data-pp-src="https://www.youtube-nocookie.com/embed/VIDEO_ID"></iframe>
```

| Attribute | Meaning |
| --- | --- |
| `data-pp-category` | `analytics`, `marketing` or `functional` |
| `type="text/plain"` | Keeps a script from running until consent |
| `data-pp-type` | Type to restore, e.g. `module` (default `text/javascript`) |
| `data-pp-src` | `src` to set once allowed (iframes, images, video) |

Google tags that read Consent Mode (GA4, Google Ads, Floodlight) follow the signals below without blocking, but while consent is denied they still load and can send cookieless pings (Google's "advanced" mode). To load them only after consent ("basic" mode), block them like any other script.

When a visitor withdraws a category, `purge` deletes first-party cookies by prefix (for example `{ analytics: ["_ga"] }`). Scripts that already run keep running until the next page load; set `reloadOnWithdraw: true` to reload straight away.

## Google Consent Mode v2

| Category | Signals |
| --- | --- |
| analytics | `analytics_storage` |
| marketing | `ad_storage`, `ad_user_data`, `ad_personalization` |
| functional | `functionality_storage`, `personalization_storage` |
| always | `security_storage: granted` |

On load the banner pushes `consent default` with everything denied (unless your inline fail-safe already did), `ads_data_redaction`, and, for returning visitors, a `consent update` with their stored choice. Every choice pushes a new `consent update`.

It also pushes a `dataLayer` event for Google Tag Manager triggers: `privacypill_ready`, `privacypill_consent`, `privacypill_show`, `privacypill_hide` and `privacypill_reset`, each with `privacypill.analytics`, `privacypill.marketing` and `privacypill.functional` set to `granted` or `denied`.

With GTM, put the fail-safe snippet in a Custom HTML tag on the **Consent Initialization – All Pages** trigger, or straight in your page's `<head>` above the GTM snippet.

## Configuration

Pass these to `data-config`, `window.PrivacyPillConfig`, `PrivacyPill.init()` or `initConsentBanner()`. Everything is optional.

| Option | Default | Description |
| --- | --- | --- |
| `layout` | `"pill"` | `"pill"`, `"bar"`, `"modal"` or `"corner"`. The modal blocks the page and traps focus. |
| `side` | `"left"` | Side for the corner layout and the reopen button. |
| `theme` | | `bg`, `fg`, `accent`, `accentFg`, `border`, `radius`, `btnRadius`, `font`, `size`, `shadow`, `buttons` (`"outline"`, `"soft"`, `"text"`). |
| `equal` | `true` | Give Reject the same style as Accept all. |
| `closeX` | `true` | Show an X on the banner; closing counts as Reject. |
| `reopen` | `true` | Floating button to change the choice later. |
| `categories` | all on | Set a category to `false` to leave it out, e.g. `{ functional: false }`. |
| `services` | | Names listed under each category, e.g. `{ analytics: ["Plausible"] }`. |
| `purge` | | Cookie name prefixes to delete when a category is withdrawn. |
| `policyUrl` | | Link to your cookie or privacy policy (`https://…` or a path starting with `/`). |
| `lang` | `"en"` | Fallback language. |
| `autoLang` | `true` | Pick the language from `<html lang>` and the browser. |
| `languages` | all | Only offer these language codes. |
| `locales` | | Extra complete languages (ES module builds). |
| `texts` | | Your own wording per language, merged over the built-in texts. |
| `expiry` | `182` | Days the choice is remembered. |
| `revision` | `1` | Bump to ask every visitor again, e.g. after adding a new tool. |
| `cookieName` | `"pp_consent"` | Name of the consent cookie. |
| `cookieDomain` | | e.g. `".example.com"` to share the choice across subdomains. |
| `gcm` | `true` | Send Consent Mode commands to `window.dataLayer`. |
| `wait` | `500` | `wait_for_update` in the Consent Mode default, in ms. |
| `redact` | `true` | `ads_data_redaction` while `ad_storage` is denied. |
| `passthrough` | `false` | Consent Mode `url_passthrough`. |
| `reloadOnWithdraw` | `false` | Reload the page when a category is withdrawn. |

Your own wording, for example:

```js
initConsentBanner({
  texts: {
    en: { title: "Cookies on example.com", analytics: { desc: "Plausible, so we know which pages help." } },
  },
});
```

For a language that isn't built in, give every text key (see `src/locales/en.ts`).

## JavaScript API

```js
PrivacyPill.open();                 // preferences panel, e.g. from a "Cookie settings" link
PrivacyPill.get();                  // { necessary: true, analytics: true, marketing: false, functional: true } or null
PrivacyPill.allowed("marketing");   // false
PrivacyPill.set({ analytics: true }); // store a choice from your own UI
PrivacyPill.accept(); PrivacyPill.reject();
PrivacyPill.reset();                // forget the choice and ask again

const stop = PrivacyPill.on((e) => {
  if (e.type === "consent" && e.consent.analytics) startMyAnalytics();
});

window.addEventListener("privacypill:consent", (e) => console.log(e.detail.gcm));
```

Event details carry `type`, `consent`, `gcm` (the Consent Mode signals), `decided`, and after a choice its `method` (`accept`, `reject`, `custom` or `api`), a random pseudonymous `id`, and `via: "close"` when the X was used. `destroy()` removes the banner from the page and keeps the stored choice.

TypeScript types ship with the package, including `window.PrivacyPill` and the `privacypill:*` window events.

## Keyboard and screen readers

- The banner and the preferences panel are labelled dialogs; switches are `role="switch"` with names.
- The modal layout and the preferences panel keep Tab and Shift+Tab inside, and bring focus back in if it lands on the page behind them.
- Focus starts on the first control in reading order, which is the policy link or Customise, never Accept all. The non-modal layouts don't take focus at all.
- After a choice, focus goes back to where the visitor was; preferences opened from the reopen button return to that button.
- Escape closes the preferences panel, and on the banner counts as the close X (Reject) unless `closeX` is off.
- Animations stop when the visitor prefers reduced motion.

## What it stores

One first-party cookie, `pp_consent` (configurable), for 182 days by default, `SameSite=Lax`, `Secure` on HTTPS. It holds a random id, the banner revision, the time, how the choice was made and the four categories. Nothing else is stored and nothing is sent anywhere. If cookies are blocked, the choice lasts for the current page view.

## GDPR and ePrivacy notes

This is not legal advice, and using this banner does not by itself make a site compliant. That depends on what your site loads, how you configure the banner, what your policy says and which national rules apply to you.

What the banner does to help:

- Optional cookies and Consent Mode signals start off, and nothing is pre-ticked.
- Rejecting is as easy as accepting: both are on the first layer with the same style by default, and the close X and Escape count as Reject.
- Consent is per category, and visitors can change or withdraw it at any time from the reopen button or your own `PrivacyPill.open()` link.
- The choice expires (182 days by default) and you can ask again by bumping `revision`.

What stays with you:

- **Mark every non-essential script, pixel and embed.** The banner can only hold back what you tag.
- **Write and link a cookie policy** that lists your tools, and keep it current.
- **Records of consent.** GDPR Article 7(1) asks you to be able to show that a visitor consented. This package keeps the choice only in the visitor's browser and sends no logs. If you need records, send `on()` events to your own server or use a service that keeps them.
- **Ads.** It is not IAB TCF and not a Google-certified CMP. Google requires a certified CMP when you serve ads with AdSense, Ad Manager or AdMob to visitors in the EEA, the UK or Switzerland.
- **Local rules.** Regulators differ, for example on the close X, on how often to ask again and on analytics exemptions. Check the guidance where your visitors are.
- **Everyone sees it.** There is no geo-targeting: the banner shows to every visitor.

## Browser support

Current Chrome, Edge, Firefox and Safari (Chrome/Edge 88+, Firefox 78+, Safari 14+). The `"soft"` button style uses `color-mix()` and falls back to plain buttons in older browsers.

## Moving to hosted PrivacyPill

The package uses the same cookie, markup, data attributes, `dataLayer` events and `window.PrivacyPill` API as PrivacyPill's hosted script, so you can swap one script tag for the other without touching your pages. If both are on a page, the first one to load runs and the other stays out of the way.

## Development

```sh
npm ci
npm run check   # typecheck, build, tests
```

`npm run build` writes `dist/`: `index.js` and `locales.js` (ES modules), `consent-banner.min.js` (script tag) and type declarations. The build fails if the script-tag file grows past 9 kB gzipped. `examples/index.html` is a demo page that works offline after a build.

Bug reports and pull requests are welcome. Please include a test for behaviour changes. Security issues: see [SECURITY.md](./SECURITY.md).

## License

[MIT](./LICENSE) © Kalmwerk

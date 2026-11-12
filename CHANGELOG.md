# Changelog

All notable changes to this package are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the package uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.0] - 2026-11-12

### Added

- First open-source release of the banner behind PrivacyPill, with every network call removed: no hosted config, no consent logging, no badge.
- Script-tag build (`consent-banner.min.js`) that starts itself from `data-config` or `window.PrivacyPillConfig`, with all six languages; `data-manual` to start it yourself.
- ES module build (`@kalmwerk/consent-banner`, `@kalmwerk/consent-banner/locales`) with TypeScript types.
- Accept all, Reject, a close X that counts as Reject, and a preferences panel with strictly necessary, analytics, marketing and functional categories.
- Google Consent Mode v2 defaults and updates, `ads_data_redaction`, optional `url_passthrough`, and `privacypill_*` dataLayer events.
- Script, iframe and embed blocking with `data-pp-category`, `data-pp-type` and `data-pp-src`, keeping CSP nonces.
- Keyboard focus handling: focus trap in the modal and the preferences panel, focus starts on Customise or the policy link, and returns to where the visitor was.
- Cookie purge by prefix when a category is withdrawn, consent revisions and expiry.
- English, German, French, Dutch, Spanish and Italian.

[Unreleased]: https://github.com/kalmwerk/consent-banner/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/kalmwerk/consent-banner/releases/tag/v1.0.0

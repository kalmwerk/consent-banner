# Publishing

Steps for the maintainers. Nothing here has been published yet.

## Names

- npm: `@kalmwerk/consent-banner` (scope `@kalmwerk` = an npm user or organisation called `kalmwerk`).
- If `@kalmwerk` isn't available: `@privacypill/consent-banner` (npm organisation `privacypill`).
- GitHub: `kalmwerk/consent-banner`. If the GitHub name differs, update `repository`, `bugs` and the CHANGELOG links in one go.

## One-time setup

1. **GitHub**: create the public repository `consent-banner` under the Kalmwerk account and push the contents of this folder to `main` (this folder is the repository root). CI runs on the first push.
2. **npm account**: sign up at npmjs.com with the Kalmwerk email, as user `kalmwerk` (that owns the `@kalmwerk` scope), and turn on two-factor authentication. Or, from any npm account, create a free organisation named `kalmwerk`.
3. **First release**. npm can only set up trusted publishing for a package that already exists, so the first version needs a token:
   - npmjs.com → Access Tokens → Generate New Token → Granular: read and write on packages, with the `@kalmwerk` scope (or all packages), expiring in 7 days.
   - GitHub → repository → Settings → Secrets and variables → Actions → New secret `NPM_TOKEN`.
   - Tag and push: `git tag v1.0.0 && git push origin v1.0.0`. The Release workflow tests, publishes with provenance and creates a GitHub release with `consent-banner.min.js` attached.
   - (Without GitHub: `npm login`, then `npm publish --access public` in this folder. That release has no provenance.)
4. **Trusted publishing**: npmjs.com → the package → Settings → Trusted Publisher → GitHub Actions: organisation `kalmwerk`, repository `consent-banner`, workflow `release.yml`, environment `npm`. Then delete the `NPM_TOKEN` secret and the token, and set Publishing access to "Require two-factor authentication and disallow tokens".

## Every release after that

1. Move the `Unreleased` notes in `CHANGELOG.md` under a new version heading.
2. `npm version patch` (or `minor` / `major`), which updates package.json and creates the `vX.Y.Z` tag.
3. `git push --follow-tags`. The Release workflow publishes through OIDC with provenance; no token needed.

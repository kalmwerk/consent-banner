import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import pkg from "../package.json" with { type: "json" };
import { CONSENT_DEFAULTS_SNIPPET, VERSION } from "../src/index.js";
import { fromRoot } from "./helpers.js";

const file = fromRoot;
const read = (p: string) => readFileSync(file(p), "utf8");

describe("package", () => {
  it("every export points at a built file", () => {
    const targets: string[] = [];
    const walk = (v: unknown) => {
      if (typeof v == "string") targets.push(v);
      else if (v && typeof v == "object") Object.values(v).forEach(walk);
    };
    walk(pkg.exports);
    walk([pkg.main, pkg.module, pkg.types]);
    for (const t of targets) expect(existsSync(file(t)), t).toBe(true);
  });

  it("ships its own version in every build", () => {
    expect(VERSION).toBe(pkg.version);
    expect(read("dist/consent-banner.min.js")).toContain(`v${pkg.version} `);
    expect(read("dist/index.js")).toContain(JSON.stringify(pkg.version));
  });

  it("type declarations include the window.PrivacyPill global", () => {
    expect(read("dist/index.d.ts")).toContain('import "./global.js"');
    expect(read("dist/global.d.ts")).toContain("PrivacyPill?: ConsentBannerApi");
  });

  it("is MIT licensed and has no runtime dependencies", () => {
    expect(pkg.license).toBe("MIT");
    expect(read("LICENSE")).toMatch(/^MIT License/);
    expect("dependencies" in pkg).toBe(false);
  });

  it("the CHANGELOG has an entry for this version", () => {
    expect(read("CHANGELOG.md")).toMatch(new RegExp(`^## \\[${pkg.version.replace(/\./g, "\\.")}\\]`, "m"));
  });

  it("the README states the PrivacyPill offer honestly, with paid plans on the waitlist", () => {
    const readme = read("README.md");
    expect(readme).toContain(
      "Want a visual editor, hosted config, consent logs and a cookie scan? [PrivacyPill](https://privacy-pill-consent-studio.lovable.app)",
    );
    expect(readme).toMatch(/Pro .*waitlist/i);
    expect(readme).not.toMatch(/guarantee[sd]? compliance|fully compliant|100% compliant/i);
  });

  it("the fail-safe snippet denies every optional Consent Mode signal", () => {
    for (const s of ["ad_storage", "ad_user_data", "ad_personalization", "analytics_storage"])
      expect(CONSENT_DEFAULTS_SNIPPET).toContain(`${s}:'denied'`);
  });
});

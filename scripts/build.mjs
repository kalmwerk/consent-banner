// Builds dist/: the ESM library (index.js, locales.js), the script-tag build (consent-banner.min.js)
// and TypeScript declarations. Fails if the script-tag build grows past its size budget.
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));
process.chdir(root);
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const define = { __VERSION__: JSON.stringify(pkg.version) };
const banner = { js: `/*! ${pkg.name} v${pkg.version} | MIT License | no network requests */` };
const target = ["es2020", "chrome80", "firefox78", "safari14", "edge88"];
/**
 * gzip budget for the script-tag build. The banner itself is under 6 kB; the six built-in languages
 * add about 2.5 kB, so the full file stays under 9 kB.
 */
const BUDGET = 9 * 1024;
/** global.ts only declares types; esbuild warns about importing it for side effects. */
const logOverride = { "ignored-bare-import": "silent" };

rmSync("dist", { recursive: true, force: true });

// ESM for bundlers: readable, tree-shakable, English built in, other languages on demand.
await build({
  entryPoints: ["src/index.ts", "src/locales.ts"],
  outdir: "dist",
  bundle: true,
  splitting: true,
  format: "esm",
  platform: "browser",
  target,
  define,
  banner,
  chunkNames: "chunks/[name]-[hash]",
  legalComments: "inline",
  logOverride,
});

// One file for a <script> tag: starts itself, all six languages.
await build({
  entryPoints: ["src/browser.ts"],
  outfile: "dist/consent-banner.min.js",
  bundle: true,
  minify: true,
  format: "iife",
  platform: "browser",
  target,
  define,
  banner,
  legalComments: "none",
  logOverride,
});

const require = createRequire(import.meta.url);
execFileSync(process.execPath, [require.resolve("typescript/bin/tsc"), "-p", "tsconfig.build.json"], {
  stdio: "inherit",
});

// Smallest useful ESM payload: the banner with English only, minified.
const core = await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  minify: true,
  format: "esm",
  target,
  define,
  write: false,
  logOverride,
});

const script = readFileSync("dist/consent-banner.min.js");
const size = {
  version: pkg.version,
  script: { bytes: script.length, gzip: gzipSync(script, { level: 9 }).length },
  esmEnglishOnly: { gzip: gzipSync(core.outputFiles[0].contents, { level: 9 }).length },
};
writeFileSync("dist/size.json", JSON.stringify(size, null, 2) + "\n");

const kb = (n) => (n / 1024).toFixed(2) + " kB";
console.log(
  `consent-banner.min.js  ${kb(size.script.bytes)} min, ${kb(size.script.gzip)} gzip (6 languages)\n` +
    `ESM, English only      ${kb(size.esmEnglishOnly.gzip)} gzip`,
);
if (size.script.gzip > BUDGET) {
  console.error(`consent-banner.min.js is over the ${kb(BUDGET)} gzip budget.`);
  process.exit(1);
}

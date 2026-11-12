import type { Locales } from "./types.js";
import { de } from "./locales/de.js";
import { en } from "./locales/en.js";
import { es } from "./locales/es.js";
import { fr } from "./locales/fr.js";
import { it } from "./locales/it.js";
import { nl } from "./locales/nl.js";

export { de, en, es, fr, it, nl };

/** All six built-in languages. */
export const locales: Locales = { en, de, fr, nl, es, it };

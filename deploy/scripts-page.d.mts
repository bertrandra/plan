// Les types de scripts-page.mjs, pour les tests (tests/unit/deploy/) : le module reste en JavaScript pur.

export function sortirLesScripts(html: string): { html: string; fichiers: { nom: string; code: string }[] };
export function empreintesDesScriptsEnLigne(html: string): string[];

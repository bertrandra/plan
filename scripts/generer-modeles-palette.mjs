// Engendre les modeles de palette (`src/styles/modeles/*.json`), proposes par le menu « Modeles »
// de l'ecran de la palette (`?palette`).
//
//   node scripts/generer-modeles-palette.mjs
//
// Chaque modele est decrit par quelques teintes (les neutres, l'accent, les etats, le ciel) ; le
// script en deduit les 30 jetons des deux themes, comme jetons.ts les organise, puis **pousse chaque
// couleur de texte jusqu'au contraste exige** (PAIRES_CONTRASTE) : un modele ne peut pas rendre
// l'interface illisible. tests/unit/styles/modeles.test.ts le verifie sur les fichiers ecrits.
//
// Les fichiers sont des documents `plan-palette` ordinaires : on peut les importer, les exporter,
// les enregistrer sur le serveur. Les retoucher a la main est permis ; relancer ce script les
// recalcule depuis les descriptions ci-dessous.

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const sortie = resolve(dirname(fileURLToPath(import.meta.url)), '../src/styles/modeles');

// --- Couleurs -------------------------------------------------------------------------------------
const hex = (r, v, b) => '#' + [r, v, b].map(x => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, '0')).join('').toUpperCase();
function tsl(t, s, l) {
  const S = Math.min(100, Math.max(0, s)) / 100, L = Math.min(100, Math.max(0, l)) / 100;
  const a = S * Math.min(L, 1 - L);
  const f = (n) => { const k = (n + ((t % 360) + 360) % 360 / 30) % 12; return L - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return hex(f(0) * 255, f(8) * 255, f(4) * 255);
}
function luminance(h) {
  const c = (i) => { const v = parseInt(h.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * c(1) + 0.7152 * c(3) + 0.0722 * c(5);
}
const contraste = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

/**
 * Une couleur de teinte et saturation donnees, dont la luminosite part de `l` et avance par pas de
 * `sens` (-1 : plus sombre, +1 : plus clair) jusqu'a tenir `min` contre chaque fond (marge de 0,15).
 */
function lisible(t, s, l, sens, fonds, min) {
  for (let L = l; L >= 0 && L <= 100; L += sens) {
    const c = tsl(t, s, L);
    if (fonds.every(f => contraste(c, f) >= min + 0.15)) return c;
  }
  return sens < 0 ? '#000000' : '#FFFFFF';
}

/** Les camera-* ne bougent pas : la chambre noire du releve se regarde toujours sur fond sombre. */
const CAMERA = { 'camera-bg': '#14100B', 'on-camera': '#FFFDF8', 'camera-ok': '#8FD49B', 'camera-alerte': '#F2B38F' };

/**
 * Les deux themes d'un modele. `n` : teinte et saturation des neutres (papiers, traits, encres) ;
 * `a` : l'accent ; `ok`, `danger`, `alerte` : les etats ; `ciel` : le fond de la Vue 3D. Le theme
 * sombre peut avoir ses propres neutres (`nSombre`), et chaque valeur peut etre forcee (`forcer`).
 */
function themes(m) {
  const { n, a, ok, danger, alerte, ciel } = m;
  const nS = m.nSombre ?? n;
  const clair = {};
  clair.paper = tsl(n.t, n.s, 95); clair['paper-deep'] = tsl(n.t, n.s, 91);
  clair['stage-bg'] = tsl(n.t, n.s, 93); clair['stage-trame'] = tsl(n.t, n.s * 0.8, 80);
  clair['panel-bg'] = tsl(n.t, n.s * 0.7, 99); clair['panel-2'] = clair.paper;
  clair['segment-bg'] = clair['stage-bg']; clair['input-bg'] = clair['panel-bg'];
  clair.border = tsl(n.t, n.s * 0.7, 85); clair.rule = tsl(n.t, n.s * 0.6, 79); clair.hairline = tsl(n.t, n.s * 0.6, 90);
  // Les courbes de niveau : la teinte de l'accent, assourdie, lisible sur le canevas (3 : un trait, pas du texte).
  clair.relief = lisible(a.t, a.s * 0.6, 40, -1, [clair['stage-bg']], 3);
  const fondsTexte = [clair.paper, clair['panel-bg'], clair['panel-2'], clair['input-bg'], clair['stage-bg']];
  clair.ink = lisible(n.t, Math.min(n.s, 35), 14, -1, fondsTexte, 4.5);
  clair['ink-soft'] = lisible(n.t, Math.min(n.s, 25) + 5, 38, -1, fondsTexte, 4.5);
  clair['on-ink'] = clair['panel-bg'];
  clair['on-accent'] = clair['panel-bg'];
  clair.accent = lisible(a.t, a.s, a.l ?? 42, -1, [clair['panel-bg'], clair['on-accent']], 4.5);
  clair['accent-light'] = tsl(a.t, a.s * 0.6, 88);
  clair['on-accent-light'] = lisible(a.t, a.s, 30, -1, [clair['accent-light']], 4.5);
  if (contraste(clair.ink, clair['accent-light']) < 4.65) clair['accent-light'] = tsl(a.t, a.s * 0.6, 92);
  clair.ok = lisible(ok.t, ok.s, 38, -1, [clair['panel-bg']], 3);
  clair['danger-bg'] = tsl(danger.t, danger.s * 0.7, 97);
  clair.danger = lisible(danger.t, danger.s, 35, -1, [clair['danger-bg'], clair['panel-bg']], 4.5);
  clair.alerte = lisible(alerte.t, alerte.s, 45, -1, [clair['panel-bg']], 3);
  clair['toast-bg'] = clair.ink; clair['on-toast'] = clair['panel-bg'];
  clair['fond-3d'] = tsl(ciel.t, ciel.s, 89);

  const sombre = {};
  sombre.paper = tsl(nS.t, nS.s * 0.6, 8); sombre['paper-deep'] = tsl(nS.t, nS.s * 0.6, 10);
  sombre['stage-bg'] = sombre.paper; sombre['stage-trame'] = tsl(nS.t, nS.s * 0.6, 20);
  sombre['panel-bg'] = tsl(nS.t, nS.s * 0.6, 12); sombre['panel-2'] = tsl(nS.t, nS.s * 0.6, 15);
  sombre['segment-bg'] = sombre.paper; sombre['input-bg'] = sombre['panel-2'];
  sombre.border = tsl(nS.t, nS.s * 0.5, 21); sombre.rule = tsl(nS.t, nS.s * 0.5, 26); sombre.hairline = tsl(nS.t, nS.s * 0.5, 17);
  sombre.relief = lisible(a.t, a.s * 0.5, 65, 1, [sombre['stage-bg']], 3);
  const fondsSombres = [sombre.paper, sombre['panel-bg'], sombre['panel-2'], sombre['input-bg'], sombre['stage-bg']];
  sombre.ink = lisible(nS.t, Math.min(nS.s + 10, 45), 88, 1, fondsSombres, 4.5);
  sombre['ink-soft'] = lisible(nS.t, Math.min(nS.s, 30), 66, 1, fondsSombres, 4.5);
  sombre['on-ink'] = sombre.paper;
  sombre['on-accent'] = sombre.paper;
  sombre.accent = lisible(a.t, a.s, a.lSombre ?? 62, 1, [sombre['panel-bg'], sombre['on-accent']], 4.5);
  sombre['accent-light'] = tsl(a.t, a.s * 0.4, 22);
  sombre['on-accent-light'] = lisible(a.t, a.s, 80, 1, [sombre['accent-light']], 4.5);
  if (contraste(sombre.ink, sombre['accent-light']) < 4.65) sombre['accent-light'] = tsl(a.t, a.s * 0.4, 18);
  sombre.ok = lisible(ok.t, ok.s, 58, 1, [sombre['panel-bg']], 3);
  sombre['danger-bg'] = tsl(danger.t, danger.s * 0.4, 15);
  sombre.danger = lisible(danger.t, danger.s, 74, 1, [sombre['danger-bg'], sombre['panel-bg']], 4.5);
  sombre.alerte = lisible(alerte.t, alerte.s, 64, 1, [sombre['panel-bg']], 3);
  sombre['toast-bg'] = sombre.ink; sombre['on-toast'] = sombre.paper;
  sombre['fond-3d'] = tsl(ciel.t, ciel.s * 0.4, 13);

  return { clair: { ...clair, ...CAMERA, ...(m.forcer?.clair ?? {}) }, sombre: { ...sombre, ...CAMERA, ...(m.forcer?.sombre ?? {}) } };
}

// --- Les modeles ----------------------------------------------------------------------------------
const MODELES = [
  { id: 'eau-vive', nom: 'Eau vive', description: 'Bleus de torrent et vert d’eau : frais, net, lumineux.',
    n: { t: 198, s: 30 }, a: { t: 192, s: 75 }, ok: { t: 165, s: 55 }, danger: { t: 355, s: 70 }, alerte: { t: 18, s: 75 }, ciel: { t: 200, s: 55 } },
  { id: 'vert-jardin', nom: 'Vert jardin', description: 'Feuillage, mousse et terre fraîche : le jardin en plein été.',
    n: { t: 90, s: 22 }, a: { t: 128, s: 45 }, ok: { t: 105, s: 50 }, danger: { t: 8, s: 65 }, alerte: { t: 30, s: 70 }, ciel: { t: 195, s: 40 } },
  { id: 'psychedelique', nom: 'Psychédélique', description: 'Magenta, turquoise et citron : saturé, vibrant, assumé.',
    n: { t: 290, s: 70 }, nSombre: { t: 265, s: 60 }, a: { t: 165, s: 95, lSombre: 60 }, ok: { t: 85, s: 90 }, danger: { t: 340, s: 95 }, alerte: { t: 30, s: 100 }, ciel: { t: 55, s: 90 } },
  { id: 'halloween', nom: 'Halloween', description: 'Citrouille, nuit violette et vert poison.',
    n: { t: 30, s: 45 }, nSombre: { t: 275, s: 45 }, a: { t: 24, s: 92 }, ok: { t: 95, s: 75 }, danger: { t: 0, s: 80 }, alerte: { t: 285, s: 55 }, ciel: { t: 270, s: 40 } },
  { id: 'zen', nom: 'Zen', description: 'Pierre, sable et mousse : peu de couleur, beaucoup de calme.',
    n: { t: 40, s: 10 }, a: { t: 150, s: 16 }, ok: { t: 140, s: 22 }, danger: { t: 10, s: 35 }, alerte: { t: 30, s: 35 }, ciel: { t: 200, s: 12 } },
  { id: 'monochrome', nom: 'Monochrome', description: 'Gris neutres et encre noire ; les états gardent une pointe de couleur.',
    n: { t: 0, s: 0 }, a: { t: 0, s: 0, l: 30, lSombre: 75 }, ok: { t: 140, s: 25 }, danger: { t: 0, s: 45 }, alerte: { t: 25, s: 40 }, ciel: { t: 0, s: 0 } },
  { id: 'fleurie', nom: 'Fleurie', description: 'Pétales roses, lilas et tiges vertes : une palette de printemps.',
    n: { t: 340, s: 35 }, a: { t: 322, s: 58 }, ok: { t: 110, s: 45 }, danger: { t: 355, s: 70 }, alerte: { t: 20, s: 75 }, ciel: { t: 270, s: 35 } },
  { id: 'multicolore', nom: 'Multicolore', description: 'Une teinte par rôle : accent violet, états francs, ciel turquoise.',
    n: { t: 220, s: 18 }, a: { t: 265, s: 70 }, ok: { t: 140, s: 70 }, danger: { t: 355, s: 80 }, alerte: { t: 35, s: 95 }, ciel: { t: 175, s: 60 } }
];

// L'ordre des jetons, celui de jetons.ts : les fichiers se comparent d'un coup d'oeil.
const ORDRE = ['ink', 'ink-soft', 'paper', 'paper-deep', 'stage-bg', 'stage-trame', 'panel-bg', 'panel-2', 'segment-bg', 'input-bg',
  'border', 'rule', 'hairline', 'relief', 'accent', 'on-accent', 'accent-light', 'on-accent-light', 'on-ink', 'ok', 'danger', 'danger-bg', 'alerte',
  'toast-bg', 'on-toast', 'fond-3d', 'camera-bg', 'on-camera', 'camera-ok', 'camera-alerte'];
const ordonne = (o) => Object.fromEntries(ORDRE.map(k => [k, o[k]]));

mkdirSync(sortie, { recursive: true });
for (const m of MODELES) {
  const t = themes(m);
  const doc = { format: 'plan-palette', version: 1, modifieLe: '2026-10-03T00:00:00.000Z', id: m.id, nom: m.nom, description: m.description,
    couleurs: { clair: ordonne(t.clair), sombre: ordonne(t.sombre) } };
  writeFileSync(resolve(sortie, m.id + '.json'), JSON.stringify(doc, null, 2) + '\n');
}
console.log(MODELES.length + ' modeles ecrits dans src/styles/modeles/');

// facade.html : l'interface. Une page, quatre cartes (le mur, les photos, l'objectif, le resultat)
// et un editeur plein ecran pour poser les coins. Le calcul est dans calcul.ts.

import { focale35mm, champDepuisFocale35 } from '../../src/facade/exif.js';
import { focalePx, etalonnerChamp, CHAMP_GRAND_COTE_DEFAUT } from '../../src/facade/cadrage.js';
import { mesurerHauteur } from '../../src/facade/analyse.js';
import { caler, hauteurBande, preparerRendu, regionUtile, resolutionNative, tailleSortie, type Calage, type Marges, type Morceau, type P2, type Source } from './calcul.js';

/** Plus grand cote d'un apercu : celui de Plan (spec-releve-facade §6). */
const APERCU_MAX = 2400;
/** Surface maximale d'un canevas sur iOS (4096 x 4096) : la photo et le resultat la respectent. */
const SURFACE_MAX = 16_000_000;
const COTE_MAX = 16_384;

interface Photo {
  id: number;
  nom: string;
  fichier: File;
  img: HTMLImageElement;
  /** Taille de la photo d'origine, orientee. */
  L: number;
  H: number;
  apercu: HTMLCanvasElement;
  /** Facteur photo -> apercu. */
  ak: number;
  vignette: string;
  /** Coins dans la photo d'origine : haut gauche, haut droit, bas droit, bas gauche. */
  coins: P2[] | null;
  f35: number | null;
}

/* ---------- reglages gardes sur l'appareil ---------- */

interface Reglages {
  champ: number;
  largeur: string;
  hauteur: string;
  haut: string;
  cotes: string;
  bas: string;
  qualite: string;
}
const CLE = 'facade.reglages.v1';
const reglages: Reglages = { champ: CHAMP_GRAND_COTE_DEFAUT, largeur: '', hauteur: '', haut: '', cotes: '0', bas: '0', qualite: 'native' };
try {
  Object.assign(reglages, JSON.parse(localStorage.getItem(CLE) ?? '{}'));
} catch {
  /* stockage indisponible : les valeurs par defaut suffisent */
}
function garder() {
  try {
    localStorage.setItem(CLE, JSON.stringify(reglages));
  } catch {
    /* idem */
  }
}

/* ---------- petits outils ---------- */

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const fr = (v: number, n = 2) => v.toFixed(n).replace('.', ',');
const nombre = (s: string): number | null => {
  const v = parseFloat(s.replace(',', '.').trim());
  return Number.isFinite(v) ? v : null;
};
const attendre = () => new Promise<void>((r) => setTimeout(r, 0));
let suivant = 1;
const photos: Photo[] = [];

function message(el: HTMLElement, texte: string, ton: 'info' | 'bon' | 'alerte' = 'info') {
  el.textContent = texte;
  el.dataset.ton = ton;
  el.hidden = !texte;
}

/* ---------- chargement des photos ---------- */

async function charger(fichier: File): Promise<Photo> {
  const url = URL.createObjectURL(fichier);
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  // naturalWidth/Height sont ceux de l'image orientee (EXIF Orientation applique par le navigateur).
  const L = img.naturalWidth,
    H = img.naturalHeight;
  const ak = Math.min(1, APERCU_MAX / Math.max(L, H));
  const apercu = document.createElement('canvas');
  apercu.width = Math.round(L * ak);
  apercu.height = Math.round(H * ak);
  apercu.getContext('2d')!.drawImage(img, 0, 0, apercu.width, apercu.height);
  const v = document.createElement('canvas');
  const vk = 160 / Math.max(L, H);
  v.width = Math.round(L * vk);
  v.height = Math.round(H * vk);
  v.getContext('2d')!.drawImage(apercu, 0, 0, v.width, v.height);
  let f35: number | null = null;
  try {
    f35 = focale35mm(await fichier.slice(0, 262_144).arrayBuffer());
  } catch {
    f35 = null;
  }
  return { id: suivant++, nom: fichier.name, fichier, img, L, H, apercu, ak, vignette: v.toDataURL('image/jpeg', 0.7), coins: null, f35 };
}

function champDe(p: Photo): number {
  return p.f35 ? champDepuisFocale35(p.f35) : reglages.champ;
}

/** Coins proposes : un rectangle centre, la photo de gauche tient le coin gauche, etc. */
function coinsProposes(p: Photo, i: number, n: number): P2[] {
  const mx = n === 1 ? 0.15 : 0.08;
  let x0 = p.L * mx,
    x1 = p.L * (1 - mx);
  if (n > 1 && i === 0) x0 = p.L * 0.2;
  if (n > 1 && i === n - 1) x1 = p.L * 0.8;
  const y0 = p.H * 0.3,
    y1 = p.H * 0.75;
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

/* ---------- la carte du mur ---------- */

function lireMur(): { largeur: number | null; hauteur: number | null; marges: Marges } {
  const largeur = nombre(reglages.largeur);
  const hauteur = nombre(reglages.hauteur);
  const haut = nombre(reglages.haut);
  return {
    largeur: largeur && largeur > 0 ? largeur : null,
    hauteur: hauteur && hauteur > 0 ? hauteur : null,
    marges: {
      haut: haut !== null && haut >= 0 ? haut : largeur && largeur > 0 ? hauteurBande(largeur) : 3,
      cotes: Math.max(0, nombre(reglages.cotes) ?? 0),
      bas: Math.max(0, nombre(reglages.bas) ?? 0),
    },
  };
}

function lierChamp(id: keyof Reglages) {
  const el = $<HTMLInputElement>('ch-' + id);
  el.value = String(reglages[id]);
  el.addEventListener('input', () => {
    (reglages as unknown as Record<string, string>)[id] = el.value;
    garder();
    majMur();
  });
}

function majMur() {
  const m = lireMur();
  $<HTMLInputElement>('ch-haut').placeholder = m.largeur ? 'auto : ' + fr(hauteurBande(m.largeur), 1) : 'auto';
  majResultatPossible();
}

/* ---------- la liste des photos ---------- */

function majPhotos() {
  const liste = $('photos');
  liste.replaceChildren();
  photos.forEach((p, i) => {
    const li = document.createElement('li');
    li.className = 'photo';
    const im = document.createElement('img');
    im.src = p.vignette;
    im.alt = 'Photo ' + (i + 1);
    const corps = document.createElement('div');
    corps.className = 'photo-corps';
    const titre = document.createElement('strong');
    titre.textContent = (photos.length > 1 ? `${i + 1}. ` : '') + (photos.length === 1 ? 'Le mur entier' : i === 0 ? 'Bord gauche' : i === photos.length - 1 ? 'Bord droit' : 'Milieu');
    const info = document.createElement('span');
    info.className = 'discret';
    const champ = champDe(p);
    info.textContent = `${p.L} × ${p.H} px · ${p.f35 ? p.f35 + ' mm (EXIF), ' : 'réglage, '}${fr(champ, 1)}°`;
    const etat = document.createElement('span');
    etat.className = p.coins ? 'etat bon' : 'etat';
    etat.textContent = p.coins ? 'Coins posés' : 'Coins à poser';
    corps.append(titre, info, etat);
    const actions = document.createElement('div');
    actions.className = 'photo-actions';
    const bouton = (texte: string, titreB: string, fn: () => void, desactive = false) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'petit';
      b.textContent = texte;
      b.title = titreB;
      b.setAttribute('aria-label', titreB);
      b.disabled = desactive;
      b.addEventListener('click', fn);
      actions.append(b);
    };
    bouton('Coins', 'Poser les coins de la photo ' + (i + 1), () => ouvrirEditeur(p));
    if (photos.length > 1) {
      bouton('◀', 'Déplacer vers la gauche', () => deplacer(i, -1), i === 0);
      bouton('▶', 'Déplacer vers la droite', () => deplacer(i, 1), i === photos.length - 1);
    }
    bouton('✕', 'Retirer la photo ' + (i + 1), () => {
      photos.splice(i, 1);
      URL.revokeObjectURL(p.img.src);
      majPhotos();
    });
    li.append(im, corps, actions);
    im.addEventListener('click', () => ouvrirEditeur(p));
    liste.append(li);
  });
  $('photos-vide').hidden = photos.length > 0;
  $('consigne-photos').textContent =
    photos.length > 1
      ? 'Plusieurs photos : de gauche à droite, chacune recouvrant la précédente d’environ un tiers. Sur chacune, l’égout en haut et le pied du mur en bas ; la première tient le coin gauche du mur, la dernière le coin droit.'
      : 'Une photo si tout le mur tient dans l’image. Sinon, plusieurs photos de gauche à droite, en vous décalant le long du mur et en gardant un tiers de la photo précédente.';
  majResultatPossible();
}

function deplacer(i: number, sens: number) {
  const j = i + sens;
  if (j < 0 || j >= photos.length) return;
  [photos[i], photos[j]] = [photos[j]!, photos[i]!];
  majPhotos();
}

async function ajouter(fichiers: FileList | null) {
  if (!fichiers || !fichiers.length) return;
  const etat = $('etat-photos');
  message(etat, 'Lecture de la photo…');
  const nouvelles: Photo[] = [];
  for (const f of Array.from(fichiers)) {
    try {
      nouvelles.push(await charger(f));
    } catch {
      message(etat, `« ${f.name} » n’a pas pu être lue (format non pris en charge ?).`, 'alerte');
      return;
    }
  }
  photos.push(...nouvelles);
  message(etat, '');
  majPhotos();
  // Une seule photo ajoutee : on enchaine sur ses coins.
  if (nouvelles.length === 1) ouvrirEditeur(nouvelles[0]!);
}

/* ---------- l'editeur plein ecran (coins, ou segment d'etalonnage) ---------- */

interface Edition {
  photo: Photo;
  /** Poignees dans l'apercu. */
  pts: P2[];
  mode: 'coins' | 'etalon';
  sel: number;
  s: number;
  ox: number;
  oy: number;
  valider: (pts: P2[]) => void;
}
let ed: Edition | null = null;
const toile = () => $<HTMLCanvasElement>('toile');
const NOMS = ['haut gauche', 'haut droit', 'bas droit', 'bas gauche'];

function ouvrirEditeur(p: Photo) {
  const i = photos.indexOf(p),
    n = photos.length;
  const coins = (p.coins ?? coinsProposes(p, i, n)).map((q) => ({ x: q.x * p.ak, y: q.y * p.ak }));
  let consigne = 'Posez les quatre coins du mur : l’égout (ou l’acrotère) en haut, le pied du mur en bas. Un coin caché se pose là où il serait.';
  if (n > 1)
    consigne =
      i === 0
        ? `Photo 1 sur ${n} : à gauche, le coin gauche du mur ; à droite, une verticale du mur près du bord de la photo. L’égout en haut, le pied en bas.`
        : i === n - 1
          ? `Photo ${n} sur ${n} : à droite, le coin droit du mur ; à gauche, une verticale du mur près du bord. L’égout en haut, le pied en bas.`
          : `Photo ${i + 1} sur ${n} : deux verticales du mur près des bords de la photo, de l’égout au pied.`;
  demarrerEdition(p, coins, 'coins', consigne, (pts) => {
    p.coins = pts.map((q) => ({ x: q.x / p.ak, y: q.y / p.ak }));
    majPhotos();
  });
}

function demarrerEdition(p: Photo, pts: P2[], mode: Edition['mode'], consigne: string, valider: (pts: P2[]) => void) {
  ed = { photo: p, pts, mode, sel: 0, s: 1, ox: 0, oy: 0, valider };
  $('editeur').hidden = false;
  document.body.classList.add('fige');
  $('ed-consigne').textContent = consigne;
  $('ed-etalon').hidden = mode !== 'etalon';
  cadrer();
  majMesure();
  dessiner();
}

function fermerEditeur() {
  ed = null;
  $('editeur').hidden = true;
  document.body.classList.remove('fige');
}

/** Ajuste la vue : toute la photo, avec une marge pour attraper un coin hors cadre. */
function cadrer() {
  if (!ed) return;
  const c = toile();
  const r = c.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  c.width = Math.round(r.width * dpr);
  c.height = Math.round(r.height * dpr);
  const a = ed.photo.apercu;
  const s = Math.min(r.width / (a.width * 1.3), r.height / (a.height * 1.3));
  ed.s = s;
  ed.ox = (r.width - a.width * s) / 2;
  ed.oy = (r.height - a.height * s) / 2;
}

const versEcran = (q: P2) => ({ x: q.x * ed!.s + ed!.ox, y: q.y * ed!.s + ed!.oy });

let loupe: { x: number; y: number } | null = null;
let demande = 0;
function dessiner() {
  if (demande) return;
  demande = requestAnimationFrame(() => {
    demande = 0;
    if (!ed) return;
    const c = toile();
    const ctx = c.getContext('2d')!;
    const dpr = c.width / c.getBoundingClientRect().width || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(ed.photo.apercu, ed.ox, ed.oy, ed.photo.apercu.width * ed.s, ed.photo.apercu.height * ed.s);
    const e = ed.pts.map(versEcran);
    ctx.lineWidth = 1.5;
    if (ed.mode === 'coins') {
      // Les cotes prolonges, en pointilles : ils aident a suivre une arete du mur.
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = 'rgba(255,255,255,.45)';
      for (let k = 0; k < 4; k++) prolonger(ctx, e[k]!, e[(k + 1) % 4]!);
      ctx.setLineDash([]);
      const couleurs = ['#ff9f1c', '#ffffff', '#2ec4f1', '#ffffff'];
      for (let k = 0; k < 4; k++) {
        ctx.strokeStyle = couleurs[k]!;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(e[k]!.x, e[k]!.y);
        ctx.lineTo(e[(k + 1) % 4]!.x, e[(k + 1) % 4]!.y);
        ctx.stroke();
      }
    } else {
      ctx.strokeStyle = '#ff9f1c';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(e[0]!.x, e[0]!.y);
      ctx.lineTo(e[1]!.x, e[1]!.y);
      ctx.stroke();
    }
    e.forEach((q, k) => {
      ctx.beginPath();
      ctx.arc(q.x, q.y, k === ed!.sel ? 15 : 12, 0, Math.PI * 2);
      ctx.fillStyle = k === ed!.sel ? 'rgba(255,159,28,.35)' : 'rgba(0,0,0,.25)';
      ctx.fill();
      ctx.strokeStyle = k === ed!.sel ? '#ff9f1c' : '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(q.x - 5, q.y);
      ctx.lineTo(q.x + 5, q.y);
      ctx.moveTo(q.x, q.y - 5);
      ctx.lineTo(q.x, q.y + 5);
      ctx.stroke();
    });
    if (loupe) dessinerLoupe(ctx, ed.pts[ed.sel]!);
  });
}

function prolonger(ctx: CanvasRenderingContext2D, a: P2, b: P2) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const n = Math.hypot(dx, dy);
  if (n < 1) return;
  const k = 4000 / n;
  ctx.beginPath();
  ctx.moveTo(a.x - dx * k, a.y - dy * k);
  ctx.lineTo(b.x + dx * k, b.y + dy * k);
  ctx.stroke();
}

/** La loupe : la region autour de la poignee, grossie, dans un coin oppose au doigt. */
function dessinerLoupe(ctx: CanvasRenderingContext2D, q: P2) {
  if (!ed || !loupe) return;
  const r = toile().getBoundingClientRect();
  const R = Math.min(80, r.width * 0.2);
  const gauche = loupe.x > r.width / 2;
  const cx = gauche ? R + 12 : r.width - R - 12,
    cy = R + 12;
  const g = Math.min(8, Math.max(2.5, ed.s * 5));
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = '#111';
  ctx.fill();
  ctx.clip();
  ctx.imageSmoothingEnabled = g < 4;
  ctx.drawImage(ed.photo.apercu, cx - q.x * g, cy - q.y * g, ed.photo.apercu.width * g, ed.photo.apercu.height * g);
  // Les cotes de la figure, dans la loupe aussi.
  ctx.strokeStyle = 'rgba(255,159,28,.9)';
  ctx.lineWidth = 1.5;
  const L = (p: P2) => ({ x: cx + (p.x - q.x) * g, y: cy + (p.y - q.y) * g });
  const n = ed.pts.length;
  ed.pts.forEach((p, k) => {
    if (ed!.mode === 'etalon' && k === 1) return;
    const a = L(p),
      b = L(ed!.pts[(k + 1) % n]!);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  });
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - R, cy);
  ctx.lineTo(cx - 6, cy);
  ctx.moveTo(cx + 6, cy);
  ctx.lineTo(cx + R, cy);
  ctx.moveTo(cx, cy - R);
  ctx.lineTo(cx, cy - 6);
  ctx.moveTo(cx, cy + 6);
  ctx.lineTo(cx, cy + R);
  ctx.stroke();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.stroke();
}

/** Mesure en direct : la hauteur que donnent ces coins (une photo), ou le champ (etalonnage). */
function majMesure() {
  if (!ed) return;
  const m = $('ed-mesure');
  const p = ed.photo;
  if (ed.mode === 'coins') {
    const mur = lireMur();
    const nom = 'Poignée : ' + NOMS[ed.sel];
    if (photos.length === 1 && mur.largeur) {
      const f = focalePx(p.apercu.width, p.apercu.height, champDe(p));
      const h = mesurerHauteur(ed.pts, mur.largeur, f, p.apercu.width, p.apercu.height);
      m.textContent = nom + (h ? ` · hauteur mesurée ${fr(h)} m` : ' · hauteur non mesurable avec ces coins');
    } else m.textContent = nom;
  } else {
    const champ = champEtalon();
    m.textContent = champ ? `Champ du grand côté : ${fr(champ, 1)}°` : 'Saisissez la distance et la longueur.';
  }
}

function champEtalon(): number | null {
  if (!ed || ed.mode !== 'etalon') return null;
  const d = nombre($<HTMLInputElement>('et-distance').value),
    t = nombre($<HTMLInputElement>('et-longueur').value);
  const a = ed.pts[0]!,
    b = ed.pts[1]!;
  const px = Math.hypot(b.x - a.x, b.y - a.y) / ed.photo.ak;
  if (!d || !t || d <= 0 || t <= 0 || px < 4) return null;
  const c = etalonnerChamp(d, t, px, Math.max(ed.photo.L, ed.photo.H));
  return c > 10 && c < 150 ? c : null;
}

function installerEditeur() {
  const c = toile();
  const doigts = new Map<number, P2>();
  let geste:
    | { type: 'poignee'; k: number; depart: P2; ecran: P2 }
    | { type: 'vue'; ox: number; oy: number; ecran: P2 }
    | { type: 'pince'; d0: number; s0: number; m0: P2; img: P2 }
    | null = null;
  const pos = (e: PointerEvent): P2 => {
    const r = c.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const debutPince = () => {
    const [a, b] = [...doigts.values()];
    if (!a || !b || !ed) return;
    const m0 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    geste = { type: 'pince', d0: Math.hypot(b.x - a.x, b.y - a.y), s0: ed.s, m0, img: { x: (m0.x - ed.ox) / ed.s, y: (m0.y - ed.oy) / ed.s } };
    loupe = null;
  };
  c.addEventListener('pointerdown', (e) => {
    if (!ed) return;
    c.setPointerCapture(e.pointerId);
    const p = pos(e);
    doigts.set(e.pointerId, p);
    if (doigts.size === 2) return debutPince();
    if (doigts.size > 2) return;
    // La poignee la plus proche, dans un rayon genereux pour le doigt.
    let k = -1,
      best = e.pointerType === 'mouse' ? 20 : 36;
    ed.pts.forEach((q, i) => {
      const s = versEcran(q);
      const d = Math.hypot(s.x - p.x, s.y - p.y);
      if (d < best) {
        best = d;
        k = i;
      }
    });
    if (k >= 0) {
      ed.sel = k;
      geste = { type: 'poignee', k, depart: { ...ed.pts[k]! }, ecran: p };
      loupe = p;
      majMesure();
    } else geste = { type: 'vue', ox: ed.ox, oy: ed.oy, ecran: p };
    dessiner();
  });
  c.addEventListener('pointermove', (e) => {
    if (!ed || !doigts.has(e.pointerId)) return;
    const p = pos(e);
    doigts.set(e.pointerId, p);
    if (!geste) return;
    if (geste.type === 'poignee') {
      // Deplacement relatif : la poignee suit le doigt sans se cacher dessous.
      ed.pts[geste.k] = { x: geste.depart.x + (p.x - geste.ecran.x) / ed.s, y: geste.depart.y + (p.y - geste.ecran.y) / ed.s };
      loupe = p;
      majMesure();
    } else if (geste.type === 'vue') {
      ed.ox = geste.ox + p.x - geste.ecran.x;
      ed.oy = geste.oy + p.y - geste.ecran.y;
    } else {
      const [a, b] = [...doigts.values()];
      if (!a || !b) return;
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const s = Math.min(40, Math.max(0.02, (geste.s0 * Math.hypot(b.x - a.x, b.y - a.y)) / Math.max(1, geste.d0)));
      ed.s = s;
      ed.ox = m.x - geste.img.x * s;
      ed.oy = m.y - geste.img.y * s;
    }
    dessiner();
  });
  const fin = (e: PointerEvent) => {
    doigts.delete(e.pointerId);
    if (doigts.size === 1 && geste?.type === 'pince' && ed) {
      const [p] = [...doigts.values()];
      geste = { type: 'vue', ox: ed.ox, oy: ed.oy, ecran: p! };
    } else if (doigts.size === 0) {
      geste = null;
      loupe = null;
    }
    dessiner();
  };
  c.addEventListener('pointerup', fin);
  c.addEventListener('pointercancel', fin);
  c.addEventListener(
    'wheel',
    (e) => {
      if (!ed) return;
      e.preventDefault();
      const r = c.getBoundingClientRect();
      const m = { x: e.clientX - r.left, y: e.clientY - r.top };
      const img = { x: (m.x - ed.ox) / ed.s, y: (m.y - ed.oy) / ed.s };
      ed.s = Math.min(40, Math.max(0.02, ed.s * Math.exp(-e.deltaY * 0.0015)));
      ed.ox = m.x - img.x * ed.s;
      ed.oy = m.y - img.y * ed.s;
      dessiner();
    },
    { passive: false },
  );
  // Le pave fin : un demi-pixel d'ecran par appui, pour finir a la loupe.
  const pousser = (dx: number, dy: number) => {
    if (!ed) return;
    const q = ed.pts[ed.sel]!;
    const pas = 0.5 / ed.s;
    ed.pts[ed.sel] = { x: q.x + dx * pas, y: q.y + dy * pas };
    loupe = versEcran(ed.pts[ed.sel]!);
    majMesure();
    dessiner();
    clearTimeout(minuterieLoupe);
    minuterieLoupe = window.setTimeout(() => {
      loupe = null;
      dessiner();
    }, 1200);
  };
  let minuterieLoupe = 0;
  const repeter = (id: string, dx: number, dy: number) => {
    const b = $(id);
    let t = 0;
    const arret = () => clearInterval(t);
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      pousser(dx, dy);
      clearInterval(t);
      t = window.setInterval(() => pousser(dx, dy), 90);
    });
    b.addEventListener('pointerup', arret);
    b.addEventListener('pointerleave', arret);
    b.addEventListener('pointercancel', arret);
  };
  repeter('pv-g', -1, 0);
  repeter('pv-d', 1, 0);
  repeter('pv-h', 0, -1);
  repeter('pv-b', 0, 1);
  $('pv-suivant').addEventListener('click', () => {
    if (!ed) return;
    ed.sel = (ed.sel + 1) % ed.pts.length;
    majMesure();
    dessiner();
  });
  $('ed-cadrer').addEventListener('click', () => {
    cadrer();
    dessiner();
  });
  $('ed-annuler').addEventListener('click', fermerEditeur);
  $('ed-valider').addEventListener('click', () => {
    if (!ed) return;
    if (ed.mode === 'etalon' && !champEtalon()) {
      majMesure();
      return;
    }
    ed.valider(ed.pts);
    fermerEditeur();
  });
  for (const id of ['et-distance', 'et-longueur']) $(id).addEventListener('input', majMesure);
  window.addEventListener('resize', () => {
    if (!ed) return;
    cadrer();
    dessiner();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ed) fermerEditeur();
  });
}

/* ---------- l'objectif ---------- */

function majObjectif() {
  $<HTMLInputElement>('ch-champ').value = fr(reglages.champ, 1);
  $('objectif-info').textContent = `Focale équivalente ${fr(36 / 2 / Math.tan((reglages.champ * Math.PI) / 360), 1)} mm (24×36). Une photo qui porte sa focale dans ses données EXIF l’emporte.`;
  majPhotos();
}

async function etalonner(fichiers: FileList | null) {
  const f = fichiers?.[0];
  if (!f) return;
  let p: Photo;
  try {
    p = await charger(f);
  } catch {
    message($('etat-photos'), 'Photo illisible.', 'alerte');
    return;
  }
  const a = p.apercu;
  const pts = [
    { x: a.width * 0.3, y: a.height * 0.5 },
    { x: a.width * 0.7, y: a.height * 0.5 },
  ];
  demarrerEdition(p, pts, 'etalon', 'Étalonnage : posez les deux extrémités de l’objet de longueur connue, photographié de face, au centre de l’image.', () => {
    const c = champEtalon();
    if (c) {
      reglages.champ = Math.round(c * 10) / 10;
      garder();
      majObjectif();
    }
  });
}

/* ---------- le resultat ---------- */

function majResultatPossible() {
  const mur = lireMur();
  const manque: string[] = [];
  if (!mur.largeur) manque.push('la largeur du mur');
  if (!photos.length) manque.push('au moins une photo');
  else if (photos.some((p) => !p.coins)) manque.push('les coins de chaque photo');
  $<HTMLButtonElement>('redresser').disabled = manque.length > 0 || calcul;
  $('manque').textContent = manque.length ? 'Il manque ' + manque.join(', ') + '.' : '';
}

let calcul = false;
let dernier: { canvas: HTMLCanvasElement; nom: string } | null = null;

function morceauDe(p: Photo): Morceau {
  const a = p.apercu;
  const donnees = a.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, a.width, a.height).data;
  return {
    apercu: { largeur: a.width, hauteur: a.height, donnees },
    coins: p.coins!.map((q) => ({ x: q.x * p.ak, y: q.y * p.ak })),
    focale: focalePx(a.width, a.height, champDe(p)),
  };
}

function resolutionChoisie(native: number, largeur: number, cal: Calage, marges: Marges): number {
  const l = largeur + 2 * marges.cotes,
    h = marges.haut + cal.hauteur + marges.bas;
  const plafond = Math.min(Math.sqrt(SURFACE_MAX / (l * h)), COTE_MAX / Math.max(l, h));
  let px = native;
  if (reglages.qualite === 'moitie') px = native / 2;
  if (reglages.qualite === 'leger') px = Math.min(native, Math.sqrt(4_000_000 / (l * h)));
  return Math.max(10, Math.min(px, plafond));
}

/** Les pixels utiles de la photo d'origine, a pleine resolution (bornee par le canevas). */
function sourceDe(p: Photo, region: { x0: number; y0: number; x1: number; y1: number }): Source {
  const w = region.x1 - region.x0,
    h = region.y1 - region.y0;
  const k = Math.min(1, Math.sqrt(SURFACE_MAX / (w * h)), COTE_MAX / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k));
  c.height = Math.max(1, Math.round(h * k));
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(p.img, region.x0, region.y0, w, h, 0, 0, c.width, c.height);
  const donnees = ctx.getImageData(0, 0, c.width, c.height).data;
  c.width = c.height = 0;
  return { image: { largeur: Math.round(w * k), hauteur: Math.round(h * k), donnees }, ox: region.x0, oy: region.y0, k: Math.round(w * k) / w };
}

async function redresser() {
  const mur = lireMur();
  if (!mur.largeur || calcul) return;
  const largeur = mur.largeur;
  calcul = true;
  majResultatPossible();
  const etat = $('etat-resultat');
  const barre = $<HTMLProgressElement>('progres');
  barre.hidden = false;
  barre.value = 0;
  try {
    message(etat, 'Calage des photos…');
    await attendre();
    const morceaux = photos.map(morceauDe);
    const cal = caler({ morceaux, largeur, hauteurConnue: mur.hauteur });
    if (!cal) throw new Error('Les coins ne forment pas un quadrilatère utilisable : vérifiez-les.');
    const coinsPleins = photos.map((p) => p.coins!);
    const native = resolutionNative(cal, coinsPleins);
    const px = resolutionChoisie(native, largeur, cal, mur.marges);
    const taille = tailleSortie(largeur, cal, mur.marges, px);
    message(etat, `Redressement à ${Math.round(px)} px/m (${taille.l} × ${taille.h} px)…`);
    await attendre();
    const sources: Source[] = [];
    for (let i = 0; i < photos.length; i++) {
      const p = photos[i]!;
      const region = regionUtile(cal, mur.marges, i, p.coins!, p.L, p.H);
      if (!region) throw new Error(`La photo ${i + 1} ne montre rien du mur avec ces coins.`);
      sources.push(sourceDe(p, region));
    }
    const rendu = preparerRendu(largeur, cal, mur.marges, px, coinsPleins, sources);
    const pas = Math.max(8, Math.round(400_000 / rendu.largeur));
    for (let y = 0; y < rendu.hauteur; y += pas) {
      rendu.lignes(y, y + pas);
      barre.value = Math.min(1, (y + pas) / rendu.hauteur);
      await attendre();
    }
    sources.length = 0;
    const canvas = $<HTMLCanvasElement>('resultat');
    canvas.width = rendu.largeur;
    canvas.height = rendu.hauteur;
    canvas.getContext('2d')!.putImageData(new ImageData(rendu.sortie, rendu.largeur, rendu.hauteur), 0, 0);
    $('resultat-bloc').hidden = false;
    const date = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    dernier = { canvas, nom: `facade_${fr(largeur)}x${fr(cal.hauteur)}m_${Math.round(px)}pxm_${date}` };
    const source = { mesuree: 'mesurée sur la photo', saisie: 'saisie', apparente: 'proportions apparentes (focale inconnue ou coins dégénérés) : à vérifier' }[cal.sourceHauteur];
    const lignes = [
      `Mur : ${fr(largeur)} m × ${fr(cal.hauteur)} m (hauteur ${source}).`,
      `Image : ${rendu.largeur} × ${rendu.hauteur} px, ${Math.round(px)} px/m (1 px = ${fr(100 / px, 1)} cm) ; résolution native des photos ≈ ${Math.round(native)} px/m.`,
      `Le pied du mur est à ${fr(mur.marges.haut + cal.hauteur)} m du haut de l’image, l’égout à ${fr(mur.marges.haut)} m${mur.marges.cotes ? `, le coin gauche à ${fr(mur.marges.cotes)} m du bord` : ''}.`,
    ];
    const faibles = cal.jointures.map((j, k) => ({ j, k })).filter((x) => x.j < 0.5);
    if (cal.etirement && Math.abs(cal.etirement - 1) > 0.06 && photos.length > 1) lignes.push(`Attention : l’assemblage a dû être étiré de ${fr((cal.etirement - 1) * 100, 0)} % pour retrouver la largeur ; vérifiez les coins.`);
    for (const f of faibles) lignes.push(`Attention : les photos ${f.k + 1} et ${f.k + 2} se ressemblent mal sur leur partie commune (${fr(f.j)}) ; reprenez-en une en gardant un tiers de mur en commun.`);
    $('resultat-info').replaceChildren(
      ...lignes.map((t) => {
        const p = document.createElement('p');
        p.textContent = t;
        if (t.startsWith('Attention')) p.className = 'alerte';
        return p;
      }),
    );
    message(etat, 'Façade redressée. Vous pouvez l’enregistrer.', 'bon');
    $('resultat-bloc').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    message(etat, err instanceof Error ? err.message : 'Le redressement a échoué.', 'alerte');
  } finally {
    calcul = false;
    barre.hidden = true;
    majResultatPossible();
  }
}

/** Le resultat en fichier. JPEG : les zones que les photos n'ont pas vues passent en blanc. */
function enFichier(type: 'image/jpeg' | 'image/png'): Promise<File | null> {
  if (!dernier) return Promise.resolve(null);
  const { canvas, nom } = dernier;
  let source = canvas;
  if (type === 'image/jpeg') {
    source = document.createElement('canvas');
    source.width = canvas.width;
    source.height = canvas.height;
    const ctx = source.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, source.width, source.height);
    ctx.drawImage(canvas, 0, 0);
  }
  return new Promise((r) =>
    source.toBlob(
      (b) => {
        if (source !== canvas) source.width = source.height = 0;
        r(b ? new File([b], nom + (type === 'image/png' ? '.png' : '.jpg'), { type }) : null);
      },
      type,
      0.92,
    ),
  );
}

async function enregistrer(type: 'image/jpeg' | 'image/png') {
  const etat = $('etat-resultat');
  message(etat, 'Préparation du fichier…');
  const f = await enFichier(type);
  if (!f) return message(etat, 'Le fichier n’a pas pu être produit (mémoire insuffisante ?). Essayez une qualité plus légère.', 'alerte');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(f);
  a.download = f.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
  message(etat, `« ${f.name} » enregistré (${fr(f.size / 1_048_576, 1)} Mo).`, 'bon');
}

async function partager() {
  const etat = $('etat-resultat');
  const f = await enFichier('image/jpeg');
  if (!f) return message(etat, 'Le fichier n’a pas pu être produit.', 'alerte');
  try {
    await navigator.share({ files: [f], title: 'Façade redressée' });
    message(etat, 'Partagée.', 'bon');
  } catch (e) {
    if ((e as Error).name !== 'AbortError') message(etat, 'Le partage a échoué : utilisez « Enregistrer ».', 'alerte');
  }
}

/* ---------- demarrage ---------- */

function demarrer() {
  for (const id of ['largeur', 'hauteur', 'haut', 'cotes', 'bas'] as const) lierChamp(id);
  const q = $<HTMLSelectElement>('ch-qualite');
  q.value = reglages.qualite;
  q.addEventListener('change', () => {
    reglages.qualite = q.value;
    garder();
  });
  const champ = $<HTMLInputElement>('ch-champ');
  champ.addEventListener('change', () => {
    const v = nombre(champ.value);
    if (v && v > 10 && v < 150) {
      reglages.champ = v;
      garder();
    }
    majObjectif();
  });
  $('champ-defaut').addEventListener('click', () => {
    reglages.champ = CHAMP_GRAND_COTE_DEFAUT;
    garder();
    majObjectif();
  });
  for (const id of ['prendre', 'importer']) {
    const input = $<HTMLInputElement>(id);
    input.addEventListener('change', async () => {
      await ajouter(input.files);
      input.value = '';
    });
  }
  const et = $<HTMLInputElement>('etalon-photo');
  et.addEventListener('change', async () => {
    await etalonner(et.files);
    et.value = '';
  });
  $('redresser').addEventListener('click', redresser);
  $('enregistrer').addEventListener('click', () => enregistrer('image/jpeg'));
  $('enregistrer-png').addEventListener('click', () => enregistrer('image/png'));
  const peutPartager = typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([''], 'a.jpg', { type: 'image/jpeg' })] });
  $('partager').hidden = !peutPartager;
  $('partager').addEventListener('click', partager);
  $('resultat').addEventListener('click', () => $('resultat-cadre').classList.toggle('plein'));
  installerEditeur();
  majObjectif();
  majMur();
}

demarrer();

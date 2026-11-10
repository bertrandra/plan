// facade.html : l'interface. On prend (ou importe) ses photos, la page fait le reste : objectif lu
// dans l'EXIF (ou estime), redressement automatique de chaque photo, fusion, rendu a la resolution
// des photos, enregistrement. Le calcul est dans auto.ts.

import { lireExif, champDepuisFocale35 } from '../../src/facade/vision/exif.js';
import { CHAMP_GRAND_COTE_DEFAUT } from '../../src/facade/vision/cadrage.js';
import { versGris, regionUtile, type Gris, type P2, type Redressement, type Segment, type Source } from './auto.js';
import { operations, type Analyse, type Baie, type Placement, type ResultatBaies, type ResultatRedressement } from './operations.js';
import { classer } from '../../src/facade/detection/classement.js';
import { editer } from './editeur.js';
import * as stockage from './stockage.js';

/** Plus grand cote de l'apercu d'analyse. */
const ANALYSE_MAX = 1200;
/** Surface maximale d'un canevas sur iOS (4096 x 4096). */
const SURFACE_MAX = 16_000_000;
const COTE_MAX = 16_384;
/** Memoire des photos pleine resolution tenues ensemble pendant le rendu. */
const SOURCES_MAX = 40_000_000;
const GRAND_ANGLE = 108;

interface Photo {
  id: number;
  fichier: File;
  L: number;
  H: number;
  gris: Gris;
  k: number;
  segs: Segment[];
  f35: number | null;
  champEstime: number | null;
  champ: number;
  origineChamp: string;
  red: Redressement | null;
  /** Coins poses a la main (pleine resolution), ou null : redressement automatique. */
  coins: P2[] | null;
  /** 0 : la facade la mieux vue ; 1 : l'autre (photo d'angle). */
  facade: number;
  /** Champ donne par les coins poses, pour une photo sans EXIF. */
  champCoins: number | null;
  /** Calque transparent des lignes trouvees, pose sur la photo. */
  vignette: HTMLCanvasElement;
}

/* ---------- reglages gardes sur l'appareil ---------- */

const CLE = 'facade.reglages.v2';
const reglages = { objectif: 'auto', champ: String(CHAMP_GRAND_COTE_DEFAUT), qualite: 'native' };
try {
  Object.assign(reglages, JSON.parse(localStorage.getItem(CLE) ?? '{}'));
} catch {
  /* stockage indisponible */
}
function garder() {
  try {
    localStorage.setItem(CLE, JSON.stringify(reglages));
  } catch {
    /* idem */
  }
}

/* ---------- outils ---------- */

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const fr = (v: number, n = 0) => v.toFixed(n).replace('.', ',');
const attendre = () => new Promise<void>((r) => setTimeout(r, 0));
const photos: Photo[] = [];
let suivant = 1;
let occupe = false;

function message(id: string, texte: string, ton: 'info' | 'bon' | 'alerte' = 'info') {
  const el = $(id);
  el.textContent = texte;
  el.dataset.ton = ton;
  el.hidden = !texte;
}

// Une erreur sur mobile ne doit pas passer en silence : elle s'affiche en haut de la page.
function erreur(e: unknown) {
  const t = e instanceof Error ? e.message : String(e);
  journal('erreur : ' + t);
  message('erreur', 'Erreur : ' + t + ' — si elle se répète, essayez la résolution « Légère ».', 'alerte');
}
window.addEventListener('error', (e) => erreur(e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => erreur(e.reason));

/* ---------- le journal : ce qui s'est passe, lisible et copiable depuis la page ---------- */

const t0 = performance.now();
const lignesJournal: string[] = [];
function journal(t: string) {
  lignesJournal.push(`${((performance.now() - t0) / 1000).toFixed(1)} s  ${t}`);
  const el = document.getElementById('journal-texte');
  if (el) el.textContent = lignesJournal.join('\n');
}

/* ---------- le calcul, dans un Web Worker quand le navigateur le permet ---------- */

declare const __TRAVAIL__: string;
type Op = keyof typeof operations;
type Rappel = (fraction: number, texte: string) => void;

const calcul = (() => {
  let worker: Worker | null = null;
  let numero = 0;
  const attentes = new Map<number, { ok: (v: unknown) => void; ko: (e: Error) => void; progres?: Rappel | undefined }>();
  try {
    worker = new Worker(URL.createObjectURL(new Blob([__TRAVAIL__], { type: 'text/javascript' })));
    worker.onmessage = (e: MessageEvent) => {
      const m = e.data as { id: number; ok?: unknown; erreur?: string; fraction?: number; texte?: string };
      const a = attentes.get(m.id);
      if (!a) return;
      if (m.fraction !== undefined) return a.progres?.(m.fraction, m.texte ?? '');
      attentes.delete(m.id);
      if (m.erreur !== undefined) a.ko(new Error(m.erreur));
      else a.ok(m.ok);
    };
    // Un Worker qui ne demarre pas (politique de securite) : on repasse tout sur le fil principal.
    worker.onerror = (e) => {
      journal('calcul en arrière-plan indisponible (' + (e.message || 'refusé') + ') : calcul sur la page');
      worker?.terminate();
      worker = null;
      for (const [, a] of attentes) a.ko(new Error('relancer'));
      attentes.clear();
    };
  } catch {
    worker = null;
  }
  async function appeler<T>(op: Op, arg: unknown, transfert: Transferable[] = [], progres?: Rappel): Promise<T> {
    if (worker) {
      try {
        return await new Promise<T>((ok, ko) => {
          const id = ++numero;
          attentes.set(id, { ok: ok as (v: unknown) => void, ko, progres });
          worker!.postMessage({ id, op, arg }, transfert);
        });
      } catch (e) {
        if (!(e instanceof Error && e.message === 'relancer')) throw e;
      }
    }
    return (await (operations[op] as (a: unknown, p: Rappel) => Promise<unknown>)(arg, progres ?? (() => {}))) as T;
  }
  return { appeler, arrierePlan: () => !!worker };
})();

/** Ouvre une photo. Le delai garde la page de rester muette si le decodage ne repond jamais. */
function decoder(f: File, url = URL.createObjectURL(f)): Promise<{ img: HTMLImageElement; url: string }> {
  return new Promise((ok, ko) => {
    const img = new Image();
    let fini = false;
    const finir = (e?: Error) => {
      if (fini) return;
      fini = true;
      clearTimeout(minuterie);
      if (e) ko(e);
      else ok({ img, url });
    };
    const minuterie = setTimeout(() => finir(new Error(`la photo « ${f.name} » ne s’ouvre pas (délai dépassé)`)), 30_000);
    img.onload = () => (img.naturalWidth ? finir() : finir(new Error(`la photo « ${f.name} » est vide`)));
    img.onerror = () => finir(new Error(`« ${f.name} » n’a pas pu être lue (format HEIC ? réglez Réglages › Appareil photo › Formats sur « Le plus compatible »)`));
    img.src = url;
  });
}

/** Un canevas de travail, rendu aussitot : Safari limite la memoire totale des canevas. */
function pixels(img: HTMLImageElement, sx: number, sy: number, sw: number, sh: number, dw: number, dh: number) {
  const c = document.createElement('canvas');
  c.width = dw;
  c.height = dh;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
  const d = ctx.getImageData(0, 0, dw, dh).data;
  c.width = c.height = 0;
  return d;
}

/* ---------- les photos ---------- */

/** Une photo dans la liste : visible des qu'elle est choisie, analysee ensuite. */
interface Entree {
  id: number;
  fichier: File;
  url: string;
  etat: 'attente' | 'analyse' | 'prete' | 'erreur';
  texte: string;
  photo: Photo | null;
  coins: P2[] | null;
  facade: number;
}
const entrees: Entree[] = [];

/** `photos` : les seules photos analysees, dans l'ordre de la liste. */
function synchroniser() {
  photos.length = 0;
  for (const e of entrees) if (e.photo) photos.push(e.photo);
}

async function charger(e: Entree): Promise<Photo> {
  const f = e.fichier;
  const debut = performance.now();
  const { img } = await decoder(f, e.url);
  const L = img.naturalWidth,
    H = img.naturalHeight;
  journal(`photo ${e.id} ouverte : ${L} × ${H} px en ${Math.round(performance.now() - debut)} ms`);
  let k = Math.min(1, ANALYSE_MAX / Math.max(L, H));
  let gris: Gris | null = null;
  // Safari peut rendre un canevas vide sur une tres grande photo : on le voit, et on reessaie plus petit.
  for (let essai = 0; essai < 3 && !gris; essai++) {
    const l = Math.max(1, Math.round(L * k)),
      h = Math.max(1, Math.round(H * k));
    const g = versGris({ largeur: l, hauteur: h, donnees: pixels(img, 0, 0, L, H, l, h) });
    let max = 0;
    for (let i = 0; i < g.v.length; i += 97) if (g.v[i]! > max) max = g.v[i]!;
    if (max > 2) gris = g;
    else {
      journal(`photo ${e.id} : pixels illisibles à ${l} × ${h}, nouvel essai plus petit`);
      k /= 2;
    }
  }
  if (!gris) throw new Error('le navigateur n’a pas pu lire les pixels de la photo');
  let f35: number | null = null;
  try {
    f35 = lireExif(await f.slice(0, 262_144).arrayBuffer()).focale35;
  } catch {
    f35 = null;
  }
  journal(`photo ${e.id} : EXIF ${f35 ? f35 + ' mm (24×36)' : 'sans focale'}`);
  const an = await calcul.appeler<Analyse>('analyser', { gris, k, L, H, exif: !!f35 });
  journal(`photo ${e.id} : ${an.segs.length} segments, champ estimé ${an.champEstime ? fr(an.champEstime) + '°' : '—'} (${Math.round(performance.now() - debut)} ms${calcul.arrierePlan() ? ', en arrière-plan' : ''})`);
  return { id: e.id, fichier: f, L, H, gris, k, segs: an.segs, f35, champEstime: an.champEstime, champ: CHAMP_GRAND_COTE_DEFAUT, origineChamp: '', red: null, coins: e.coins, facade: e.facade, champCoins: null, vignette: document.createElement('canvas') };
}

/** Le champ de chaque photo : l'EXIF, sinon le reglage, sinon l'estimation commune aux photos. */
function choisirChamps() {
  const estimes = photos.map((p) => p.champCoins ?? p.champEstime).filter((c): c is number => c !== null).sort((a, b) => a - b);
  const median = estimes.length ? estimes[Math.floor(estimes.length / 2)]! : null;
  const regle = parseFloat(reglages.champ.replace(',', '.'));
  for (const p of photos) {
    if (p.f35) {
      p.champ = champDepuisFocale35(p.f35);
      p.origineChamp = `${p.f35} mm (EXIF)`;
    } else if (p.champCoins) {
      p.champ = p.champCoins;
      p.origineChamp = 'mesuré sur les coins posés';
    } else if (reglages.objectif === 'auto' && median) {
      p.champ = median;
      p.origineChamp = 'estimé sur les photos';
    } else if (reglages.objectif === 'grand-angle') {
      p.champ = GRAND_ANGLE;
      p.origineChamp = 'grand-angle 0,5×';
    } else if (reglages.objectif === 'valeur' && regle > 20 && regle < 150) {
      p.champ = regle;
      p.origineChamp = 'réglage';
    } else {
      p.champ = CHAMP_GRAND_COTE_DEFAUT;
      p.origineChamp = 'par défaut (objectif 1×)';
    }
  }
}

/** Redresse une photo (automatiquement, ou par ses coins) et trace ses lignes sur un calque. */
async function redresser(p: Photo) {
  const r = await calcul.appeler<ResultatRedressement>('redresser', { segs: p.segs, k: p.k, L: p.L, H: p.H, champ: p.champ, facade: p.facade, coins: p.coins });
  // Des coins poses sur une photo sans EXIF donnent son objectif : on refait avec.
  if (p.coins && !p.f35 && r.champCoins && Math.abs(r.champCoins - p.champ) > 1) {
    p.champCoins = r.champCoins;
    choisirChamps();
    return redresser(p);
  }
  p.red = r.red ?? (await calcul.appeler<ResultatRedressement>('redresser', { segs: p.segs, k: p.k, L: p.L, H: p.H, champ: p.champ, facade: 0, coins: null })).red;
  if (!r.red && p.coins) journal(`photo ${p.id} : ces coins ne forment pas un mur, redressement automatique`);
  const v = p.vignette;
  const kv = 240 / Math.max(p.L, p.H);
  v.width = Math.round(p.L * kv);
  v.height = Math.round(p.H * kv);
  const ctx = v.getContext('2d')!;
  ctx.clearRect(0, 0, v.width, v.height);
  if (!p.red) return;
  ctx.lineWidth = 1.5;
  for (const [segs, c] of [
    [p.red.verticales, '#2ec4f1'],
    [p.red.horizontales, '#ff9f1c'],
  ] as [Segment[], string][]) {
    ctx.strokeStyle = c;
    ctx.beginPath();
    for (const s of segs) {
      ctx.moveTo(s.x1 * kv, s.y1 * kv);
      ctx.lineTo(s.x2 * kv, s.y2 * kv);
    }
    ctx.stroke();
  }
  if (p.red.coins.length === 4) {
    // Le cadre retenu, en pointilles blancs.
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    p.red.coins.forEach((q, i) => (i ? ctx.lineTo(q.x * kv, q.y * kv) : ctx.moveTo(q.x * kv, q.y * kv)));
    ctx.closePath();
    ctx.stroke();
  }
}

async function redresserTout() {
  choisirChamps();
  for (const p of photos) await redresser(p);
}

/** Corriger une photo a la main : ses quatre coins, ou l'autre facade, ou retour a l'automatique. */
async function ajuster(e: Entree) {
  const p = e.photo;
  if (!p || occupe) return;
  const { img, url } = await decoder(p.fichier);
  const ak = Math.min(1, 2400 / Math.max(p.L, p.H));
  const ap = document.createElement('canvas');
  ap.width = Math.round(p.L * ak);
  ap.height = Math.round(p.H * ak);
  ap.getContext('2d')!.drawImage(img, 0, 0, ap.width, ap.height);
  URL.revokeObjectURL(url);
  const depart =
    p.coins ??
    (p.red?.coins.length === 4
      ? p.red.coins
      : [
          { x: p.L * 0.2, y: p.H * 0.25 },
          { x: p.L * 0.8, y: p.H * 0.25 },
          { x: p.L * 0.8, y: p.H * 0.75 },
          { x: p.L * 0.2, y: p.H * 0.75 },
        ]);
  const res = await editer({
    image: ap,
    points: depart.map((q) => ({ x: q.x * ak, y: q.y * ak })),
    forme: 'quad',
    noms: ['haut gauche', 'haut droit', 'bas droit', 'bas gauche'],
    consigne: 'Posez les quatre coins d’un rectangle du mur (l’égout en haut, le pied en bas ; ou une baie, un panneau) : la façade sera redressée d’après eux. Un coin caché se pose là où il serait.',
    boutons: [
      { id: 'auto', texte: 'Automatique' },
      { id: 'autre', texte: p.facade ? 'Façade principale' : 'Autre façade' },
    ],
  });
  ap.width = ap.height = 0;
  if (!res) return;
  if (res.action === 'valider') {
    p.coins = res.points.map((q) => ({ x: q.x / ak, y: q.y / ak }));
    p.facade = 0;
  } else if (res.action === 'auto') {
    p.coins = null;
    p.facade = 0;
    p.champCoins = null;
  } else if (res.action === 'autre') {
    p.coins = null;
    p.champCoins = null;
    p.facade = p.facade ? 0 : 1;
  }
  e.coins = p.coins;
  e.facade = p.facade;
  journal(`photo ${p.id} : ${p.coins ? 'coins posés à la main' : p.facade ? 'autre façade demandée' : 'redressement automatique'}`);
  void stockage.modifier(p.id, { coins: p.coins, facade: p.facade });
  occupe = true;
  majPhotos();
  try {
    choisirChamps();
    await redresser(p);
  } catch (err) {
    erreur(err);
  } finally {
    occupe = false;
    majPhotos();
  }
}

function majPhotos() {
  const liste = $('photos');
  liste.replaceChildren();
  entrees.forEach((e, i) => {
    const li = document.createElement('li');
    li.className = 'photo';
    const cadre = document.createElement('div');
    cadre.className = 'vignette';
    const im = document.createElement('img');
    im.src = e.url;
    im.alt = `Photo ${i + 1}`;
    cadre.append(im);
    const p = e.photo;
    if (p) cadre.append(p.vignette);
    const corps = document.createElement('div');
    corps.className = 'photo-corps';
    const t = document.createElement('strong');
    t.textContent = `Photo ${i + 1}`;
    const a = document.createElement('span');
    a.className = 'discret';
    const b = document.createElement('span');
    b.className = 'etat';
    if (p) {
      a.textContent = `${p.L} × ${p.H} px · objectif ${fr(p.champ)}° ${p.origineChamp}`;
      const r = p.red;
      b.className = r && !r.avis.length ? 'etat bon' : 'etat';
      b.textContent = !r
        ? ''
        : r.mode === 'coins'
          ? 'Coins posés à la main'
          : r.avis.length
            ? r.avis.join(' ; ')
            : `${r.verticales.length} verticales, ${r.horizontales.length} horizontales${r.mode === 'autre-facade' ? ' · autre façade' : ''}${r.lambda ? ' · déformation corrigée' : ''}`;
    } else {
      a.textContent = `${fr(e.fichier.size / 1_048_576, 1)} Mo`;
      b.className = e.etat === 'erreur' ? 'etat' : 'etat attente';
      b.textContent = e.texte;
    }
    corps.append(t, a, b);
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'petit';
    x.textContent = '✕';
    x.title = x.ariaLabel = `Retirer la photo ${i + 1}`;
    x.disabled = occupe;
    x.addEventListener('click', () => {
      entrees.splice(i, 1);
      URL.revokeObjectURL(e.url);
      void stockage.retirer(e.id);
      synchroniser();
      majPhotos();
    });
    const actions = document.createElement('div');
    actions.className = 'photo-actions';
    if (p) {
      const aj = document.createElement('button');
      aj.type = 'button';
      aj.className = 'petit';
      aj.textContent = 'Ajuster';
      aj.title = aj.ariaLabel = `Corriger le redressement de la photo ${i + 1}`;
      aj.disabled = occupe;
      aj.addEventListener('click', () => void ajuster(e));
      actions.append(aj);
    }
    actions.append(x);
    const poignee = document.createElement('button');
    poignee.type = 'button';
    poignee.className = 'poignee';
    poignee.textContent = '≡';
    poignee.title = 'Glisser pour changer l’ordre';
    poignee.ariaLabel = `Photo ${i + 1} sur ${entrees.length} : glisser, ou flèches haut et bas, pour changer l’ordre`;
    poignee.disabled = occupe || entrees.length < 2;
    glisser(poignee, li, i);
    li.append(poignee, cadre, corps, actions);
    liste.append(li);
  });
  $('consigne-ordre').hidden = entrees.length < 2;
  $('photos-vide').hidden = entrees.length > 0;
  $('tout-effacer').hidden = !entrees.length;
  $<HTMLButtonElement>('fusionner').disabled = occupe || !photos.length;
}

/** Deplace la photo `i` a la place `j` ; l'ordre est celui des photos de gauche a droite. */
function deplacer(i: number, j: number) {
  if (j === i || j < 0 || j >= entrees.length || occupe) return;
  const [e] = entrees.splice(i, 1);
  entrees.splice(j, 0, e!);
  journal(`photo ${e!.id} déplacée en position ${j + 1}`);
  entrees.forEach((x, k) => void stockage.modifier(x.id, { ordre: k }));
  synchroniser();
  majPhotos();
  (document.querySelectorAll<HTMLButtonElement>('#photos .poignee')[j])?.focus();
}

/**
 * Le glisser au doigt : la ligne suit le doigt, les autres s'ecartent pour lui faire place, et
 * l'ordre change au lacher. La poignee seule capte le geste (touch-action: none) : le reste de
 * la ligne laisse defiler la page.
 */
function glisser(poignee: HTMLButtonElement, li: HTMLElement, i: number) {
  poignee.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') deplacer(i, i - 1);
    else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') deplacer(i, i + 1);
    else return;
    e.preventDefault();
  });
  poignee.addEventListener('pointerdown', (ev) => {
    if (occupe || entrees.length < 2) return;
    ev.preventDefault();
    poignee.setPointerCapture(ev.pointerId);
    const items = Array.from($('photos').children) as HTMLElement[];
    const rects = items.map((x) => x.getBoundingClientRect());
    const r0 = rects[0]!,
      r1 = rects[1];
    const ecart = r1 ? r1.top - r0.bottom : 10;
    const pas = rects[i]!.height + ecart;
    const milieu = (j: number) => rects[j]!.top + rects[j]!.height / 2;
    const y0 = ev.clientY;
    const defil0 = scrollY;
    let cible = i,
      doigt = ev.clientY,
      boucle = 0;
    li.classList.add('glisse');
    // Pres du haut ou du bas de l'ecran, la page defile d'elle-meme : la liste peut depasser l'ecran.
    const defiler = () => {
      const bord = 80,
        v = doigt < bord ? -(bord - doigt) / 4 : doigt > innerHeight - bord ? (doigt - innerHeight + bord) / 4 : 0;
      if (v) {
        scrollBy(0, v);
        placer();
      }
      boucle = requestAnimationFrame(defiler);
    };
    boucle = requestAnimationFrame(defiler);
    const bouger = (e: PointerEvent) => {
      doigt = e.clientY;
      placer();
    };
    const placer = () => {
      const dy = Math.max(rects[0]!.top - rects[i]!.top, Math.min(rects[rects.length - 1]!.bottom - rects[i]!.bottom, doigt - y0 + scrollY - defil0));
      li.style.transform = `translateY(${dy}px)`;
      const c = milieu(i) + dy;
      cible = i;
      while (cible + 1 < items.length && c >= milieu(cible + 1) - 2) cible++;
      while (cible - 1 >= 0 && c <= milieu(cible - 1) + 2) cible--;
      items.forEach((x, j) => {
        if (j === i) return;
        x.style.transform = j > i && j <= cible ? `translateY(${-pas}px)` : j < i && j >= cible ? `translateY(${pas}px)` : '';
      });
    };
    const lacher = () => {
      cancelAnimationFrame(boucle);
      poignee.removeEventListener('pointermove', bouger);
      poignee.removeEventListener('pointerup', lacher);
      poignee.removeEventListener('pointercancel', lacher);
      for (const x of items) x.style.transform = '';
      li.classList.remove('glisse');
      if (cible !== i) deplacer(i, cible);
    };
    poignee.addEventListener('pointermove', bouger);
    poignee.addEventListener('pointerup', lacher);
    poignee.addEventListener('pointercancel', lacher);
  });
}

async function ajouter(fichiers: FileList | File[] | null, source: string) {
  const liste = fichiers ? Array.from(fichiers) : [];
  journal(`${source} : ${liste.length} fichier(s) reçu(s)${liste.length ? ' — ' + liste.map((f) => `${f.name || 'sans nom'} (${f.type || 'type inconnu'}, ${fr(f.size / 1_048_576, 1)} Mo)`).join(', ') : ''}`);
  if (!liste.length) {
    message('etat-photos', 'Aucune photo n’est parvenue à la page.', 'alerte');
    return;
  }
  const nouvelles: Entree[] = liste.map((f) => ({ id: suivant++, fichier: f, url: URL.createObjectURL(f), etat: 'attente', texte: 'En attente d’analyse…', photo: null, coins: null, facade: 0 }));
  entrees.push(...nouvelles);
  majPhotos();
  // Gardees sur l'appareil, pour survivre a un rechargement de la page.
  for (const e of nouvelles) {
    try {
      const ok = await stockage.mettre({ id: e.id, nom: e.fichier.name, type: e.fichier.type, octets: await e.fichier.arrayBuffer(), ordre: entrees.indexOf(e), coins: null, facade: 0 });
      if (!ok) journal(`photo ${e.id} : non gardée sur l’appareil (stockage indisponible)`);
    } catch {
      journal(`photo ${e.id} : non gardée sur l’appareil`);
    }
  }
  await analyserEnAttente();
}

/** Analyse les photos en attente, une par une, puis les redresse. */
async function analyserEnAttente() {
  if (occupe) return;
  occupe = true;
  message('erreur', '');
  try {
    for (let e = entrees.find((x) => x.etat === 'attente'); e; e = entrees.find((x) => x.etat === 'attente')) {
      e.etat = 'analyse';
      e.texte = 'Analyse des lignes…';
      majPhotos();
      await attendre();
      try {
        e.photo = await charger(e);
        e.etat = 'prete';
        e.texte = '';
      } catch (err) {
        e.etat = 'erreur';
        e.texte = 'Erreur : ' + (err instanceof Error ? err.message : String(err));
        journal(`photo ${e.id} : ${e.texte}`);
      }
      synchroniser();
    }
    await redresserTout();
  } catch (err) {
    erreur(err);
  } finally {
    occupe = false;
    synchroniser();
    majPhotos();
  }
}

/** Au demarrage : les photos gardees sur l'appareil reviennent, dans leur ordre. */
async function restaurer() {
  const t = await stockage.lister();
  if (!t.length) return;
  for (const r of t) {
    const f = new File([r.octets], r.nom || 'photo.jpg', { type: r.type || 'image/jpeg' });
    entrees.push({ id: r.id, fichier: f, url: URL.createObjectURL(f), etat: 'attente', texte: 'En attente d’analyse…', photo: null, coins: r.coins, facade: r.facade });
    suivant = Math.max(suivant, r.id + 1);
  }
  journal(`${t.length} photo(s) retrouvée(s) sur l’appareil`);
  message('etat-photos', `${t.length} photo(s) de la dernière séance, retrouvée(s) sur l’appareil.`, 'info');
  majPhotos();
  await analyserEnAttente();
}

/* ---------- la fusion ---------- */

let dernier: { sortie: Uint8ClampedArray; vu: Uint8Array; l: number; h: number; nom: string } | null = null;
/** Les baies du resultat : reperees, puis corrigees au doigt ; en pixels de l'image. */
let baies: Baie[] = [];
/** Le sol (y en pixels de l'image), quand une porte l'a situe. */
let solPx: number | null = null;
/** Pixels par metre que le reperage a estimes sur la structure, faute de longueur connue. */
let echelleEstimee: number | null = null;
/** Les baies ont-elles ete corrigees a la main (un nouveau reperage les effacerait) ? */
let baiesCorrigees = false;

async function fusionner() {
  if (occupe || !photos.length) return;
  occupe = true;
  majPhotos();
  message('erreur', '');
  const barre = $<HTMLProgressElement>('progres');
  barre.hidden = false;
  barre.value = 0;
  const etape = async (t: string, v: number) => {
    message('etat-resultat', t);
    barre.value = v;
    await attendre();
  };
  try {
    await etape('Redressement des photos…', 0);
    await redresserTout();
    majPhotos();
    const reds = photos.map((p) => p.red!);
    const pl = await calcul.appeler<Placement>('placer', { photos: photos.map((p) => ({ red: p.red, gris: p.gris, k: p.k })) }, [], (f, t) => {
      message('etat-resultat', t);
      barre.value = 0.05 + 0.3 * f;
    });
    const { T, cadre } = pl;
    for (const l of pl.liaisons) journal(`photo ${photos[l.j]!.id} raccordée à la photo ${photos[l.i]!.id} (${l.accords} points)`);
    const exclues = T.map((t, i) => (t ? -1 : i)).filter((i) => i >= 0);
    const lw = cadre.x1 - cadre.x0,
      lh = cadre.y1 - cadre.y0;
    const plafond = Math.min(Math.sqrt(SURFACE_MAX / (lw * lh)), COTE_MAX / Math.max(lw, lh));
    let px = cadre.native;
    if (reglages.qualite === 'moitie') px /= 2;
    if (reglages.qualite === 'leger') px = Math.min(px, Math.sqrt(4_000_000 / (lw * lh)));
    px = Math.min(px, plafond);
    // Les photos d'origine, pleine resolution, sur la seule region utile.
    const regions = reds.map((r, i) => (T[i] ? regionUtile(r) : null));
    const total = regions.reduce((a, g) => a + (g ? (g.x1 - g.x0) * (g.y1 - g.y0) : 0), 0);
    const kTotal = Math.min(1, Math.sqrt(SOURCES_MAX / Math.max(1, total)));
    const sources: (Source | null)[] = [];
    for (let i = 0; i < photos.length; i++) {
      const g = regions[i];
      if (!g) {
        sources.push(null);
        continue;
      }
      await etape(`Lecture pleine résolution, photo ${i + 1}…`, 0.35 + (0.1 * i) / photos.length);
      const w = g.x1 - g.x0,
        h = g.y1 - g.y0;
      const k = Math.min(kTotal, Math.sqrt(SURFACE_MAX / (w * h)), COTE_MAX / Math.max(w, h));
      const dw = Math.max(1, Math.round(w * k)),
        dh = Math.max(1, Math.round(h * k));
      const { img, url } = await decoder(photos[i]!.fichier);
      const d = pixels(img, g.x0, g.y0, w, h, dw, dh);
      URL.revokeObjectURL(url);
      sources.push({ image: { largeur: dw, hauteur: dh, donnees: d }, ox: g.x0, oy: g.y0, k: dw / w });
    }
    const transfert = sources.filter((s): s is Source => !!s).map((s) => s.image.donnees.buffer as ArrayBuffer);
    const rendu = await calcul.appeler<{ sortie: Uint8ClampedArray; vu: Uint8Array; l: number; h: number }>('rendre', { sources, px }, transfert, (f, t) => {
      message('etat-resultat', t);
      barre.value = 0.45 + 0.55 * f;
    });
    sources.length = 0;
    echelle = null;
    baies = [];
    solPx = null;
    echelleEstimee = null;
    baiesCorrigees = false;
    const date = new Date();
    const z = (n: number) => String(n).padStart(2, '0');
    dernier = { sortie: rendu.sortie, vu: rendu.vu, l: rendu.l, h: rendu.h, nom: `facade_${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}_${z(date.getHours())}${z(date.getMinutes())}` };
    apercu();
    const lignes = [
      `${rendu.l} × ${rendu.h} px (${fr((rendu.l * rendu.h) / 1e6, 1)} Mpx), à ${Math.round((px / cadre.native) * 100)} % de la résolution des photos.`,
      photos.length > 1 ? `${photos.length - exclues.length} photo(s) assemblée(s) sur ${photos.length}.` : 'Une photo, redressée.',
    ];
    for (const i of exclues) lignes.push(`Attention : la photo ${i + 1} n’a pas pu être raccordée aux autres (pas assez de détails communs) ; elle est laissée de côté. Gardez environ un tiers de mur en commun d’une photo à l’autre.`);
    $('resultat-info').replaceChildren(
      ...lignes.map((t) => {
        const p = document.createElement('p');
        p.textContent = t;
        if (t.startsWith('Attention')) p.className = 'alerte';
        return p;
      }),
    );
    majEchelle();
    $('resultat-bloc').hidden = false;
    if ($<HTMLInputElement>('ch-ouvertures').checked) await reperer();
    else majBaies();
    message('etat-resultat', 'Façade redressée. Vous pouvez l’enregistrer.', 'bon');
    $('resultat-bloc').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    message('etat-resultat', '');
    erreur(e);
  } finally {
    occupe = false;
    barre.hidden = true;
    majPhotos();
  }
}

/** Une copie reduite du resultat (`maxi` px au plus sur le grand cote), sans tenir un second canevas geant. */
function reduction(c: HTMLCanvasElement, maxi: number): number {
  const { sortie, l, h } = dernier!;
  const k = Math.min(1, maxi / Math.max(l, h));
  c.width = Math.max(1, Math.round(l * k));
  c.height = Math.max(1, Math.round(h * k));
  const im = new ImageData(c.width, c.height);
  for (let y = 0; y < c.height; y++) {
    const sy = Math.min(h - 1, Math.floor((y + 0.5) / k));
    for (let x = 0; x < c.width; x++) {
      const sx = Math.min(l - 1, Math.floor((x + 0.5) / k));
      const o = (y * c.width + x) * 4,
        s = (sy * l + sx) * 4;
      im.data[o] = sortie[s]!;
      im.data[o + 1] = sortie[s + 1]!;
      im.data[o + 2] = sortie[s + 2]!;
      im.data[o + 3] = 255;
    }
  }
  c.getContext('2d')!.putImageData(im, 0, 0);
  return k;
}

function apercu() {
  if (!dernier) return;
  const c = $<HTMLCanvasElement>('resultat');
  const k = reduction(c, 1600);
  if (baies.length && $<HTMLInputElement>('ch-ouvertures').checked) dessinerBaies(c.getContext('2d')!, k);
}

const NOMS_BAIES: Record<string, string> = { fenetre: 'Fenêtre', 'porte-fenetre': 'Porte-fenêtre', porte: 'Porte', garage: 'Porte de garage' };
const cm = (px: number) => (echelle ? String(Math.round((px / echelle) * 100)) : '—');

/** Les cotes d'une baie, en metres (si l'echelle est connue). */
function cotes(b: Baie) {
  if (!echelle) return null;
  const { x, y, l, h } = b.px;
  return { l: l / echelle, h: h / echelle, x: x / echelle, appui: solPx !== null ? Math.max(0, (solPx - (y + h)) / echelle) : null };
}

/** Les baies et leurs cotes, sur un canevas a `k` fois la taille du resultat. */
function dessinerBaies(ctx: CanvasRenderingContext2D, k: number) {
  const u = Math.max(1.5, Math.min(ctx.canvas.width, ctx.canvas.height) * 0.0025);
  ctx.save();
  ctx.lineWidth = u * 1.6;
  ctx.font = `600 ${Math.round(u * 9)}px system-ui, sans-serif`;
  ctx.textBaseline = 'bottom';
  baies.forEach((b, i) => {
    const x = b.px.x * k,
      y = b.px.y * k,
      l = b.px.l * k,
      h = b.px.h * k;
    ctx.strokeStyle = '#ff9f1c';
    ctx.strokeRect(x, y, l, h);
    const t = echelle ? `${i + 1} · ${cm(b.px.l)} × ${cm(b.px.h)}` : String(i + 1);
    const tw = ctx.measureText(t).width;
    ctx.fillStyle = 'rgba(0,0,0,.72)';
    ctx.fillRect(x, y - u * 11, tw + u * 4, u * 11);
    ctx.fillStyle = '#fff';
    ctx.fillText(t, x + u * 2, y - u * 1.2);
  });
  ctx.restore();
}

/**
 * Le sol suit les corrections : une porte recadree, retiree ou declaree le deplace. Sans cela les
 * appuis resteraient mesures depuis une porte coupee en bas, et n'existeraient jamais quand le
 * reperage n'a pas situe le sol.
 */
function resituerSol() {
  const bas = baies.filter((b) => b.type !== 'fenetre').map((b) => b.px.y + b.px.h);
  solPx = bas.length ? Math.max(...bas) : null;
}

/** Reperage automatique des baies (baies.ts, dans le Worker). Remplace la liste. */
async function reperer() {
  if (!dernier) return;
  message('etat-resultat', 'Repérage des fenêtres et des portes…');
  try {
    // Pas de copie : postMessage clone deja ce qu'on ne lui transfere pas, et sans Worker le
    // detecteur ne modifie pas ses entrees. A 16 Mpx, une copie de plus pese 77 Mo sur un telephone.
    const r = await calcul.appeler<ResultatBaies>('ouvertures', { sortie: dernier.sortie, vu: dernier.vu, l: dernier.l, h: dernier.h, pxParM: echelle });
    baies = r.baies;
    solPx = r.solPx;
    const estimees = r.baies.filter((b) => b.l > 0).map((b) => b.px.l / b.l).sort((a, b) => a - b);
    echelleEstimee = r.echelleConnue ? null : (estimees[estimees.length >> 1] ?? null);
    baiesCorrigees = false;
    journal(`baies repérées : ${baies.length}${r.solTrouve ? ', sol situé' : ''}`);
    message('etat-resultat', baies.length ? `${baies.length} baie(s) repérée(s). Vérifiez-les : ajoutez, recadrez ou retirez au besoin.` : 'Aucune baie repérée : ajoutez-les à la main.', baies.length ? 'bon' : 'info');
  } catch (e) {
    erreur(e);
  }
  majBaies();
}

/** Le tableau des baies (et l'apercu). */
function majBaies() {
  const coche = $<HTMLInputElement>('ch-ouvertures').checked;
  $('bloc-baies').hidden = !coche;
  const liste = $('liste-ouvertures');
  liste.replaceChildren();
  $('cotes-aide').hidden = !!echelle;
  $<HTMLButtonElement>('exporter-cotes').disabled = !echelle || !baies.length;
  if (coche && baies.length) {
    const t = document.createElement('table');
    const appui = echelle && solPx !== null;
    t.innerHTML = `<thead><tr><th scope="col">N°</th><th scope="col">Baie</th><th scope="col">Largeur</th><th scope="col">Hauteur</th><th scope="col">Depuis la gauche</th>${appui ? '<th scope="col">Appui</th>' : ''}<th scope="col"><span class="sr">Actions</span></th></tr></thead>`;
    const tb = document.createElement('tbody');
    baies.forEach((b, i) => {
      const tr = document.createElement('tr');
      const td = (v: string | HTMLElement) => {
        const c = document.createElement('td');
        if (typeof v === 'string') c.textContent = v;
        else c.append(v);
        tr.append(c);
      };
      td(String(i + 1));
      const sel = document.createElement('select');
      sel.className = 'petit-choix';
      sel.ariaLabel = `Type de la baie ${i + 1}`;
      for (const [v, n] of Object.entries(NOMS_BAIES)) sel.add(new Option(n, v, false, v === b.type));
      sel.addEventListener('change', () => {
        b.type = sel.value as Baie['type'];
        baiesCorrigees = true;
        // Declarer une porte situe le sol : les appuis de tout le tableau changent.
        const avant = solPx;
        resituerSol();
        if (solPx === avant) return;
        majBaies();
        liste.querySelectorAll<HTMLSelectElement>('select')[i]?.focus();
      });
      td(sel);
      const c = cotes(b);
      td(c ? `${cm(b.px.l)} cm` : '—');
      td(c ? `${cm(b.px.h)} cm` : '—');
      td(c ? `${fr(c.x, 2)} m` : '—');
      if (appui) td(c?.appui !== null && c ? `${fr(c.appui!, 2)} m` : '—');
      const actions = document.createElement('span');
      actions.className = 'actions-baie';
      const bouton = (texte: string, titre: string, f: () => void) => {
        const x = document.createElement('button');
        x.type = 'button';
        x.className = 'petit';
        x.textContent = texte;
        x.title = x.ariaLabel = titre;
        x.addEventListener('click', f);
        actions.append(x);
      };
      bouton('Recadrer', `Recadrer la baie ${i + 1}`, () => void poserBaie(i));
      bouton('✕', `Retirer la baie ${i + 1}`, () => {
        baies.splice(i, 1);
        baiesCorrigees = true;
        if (b.type !== 'fenetre') resituerSol();
        journal(`baie ${i + 1} retirée`);
        majBaies();
      });
      td(actions);
      tb.append(tr);
    });
    t.append(tb);
    liste.append(t);
  }
  apercu();
}

/** Ajouter (i absent) ou recadrer une baie : deux coins opposes poses au doigt sur le resultat. */
async function poserBaie(i?: number) {
  if (!dernier) return;
  const c = document.createElement('canvas');
  const k = reduction(c, 2400);
  const b = i !== undefined ? baies[i] : undefined;
  const depart = b
    ? [
        { x: b.px.x * k, y: b.px.y * k },
        { x: (b.px.x + b.px.l) * k, y: (b.px.y + b.px.h) * k },
      ]
    : [
        { x: c.width * 0.42, y: c.height * 0.4 },
        { x: c.width * 0.58, y: c.height * 0.62 },
      ];
  const res = await editer({
    image: c,
    points: depart,
    forme: 'rectangle',
    noms: ['coin haut gauche', 'coin bas droit'],
    consigne: 'Posez deux coins opposés de la baie : le hors-tout de la menuiserie, cadre compris.',
    mesure: (p) => {
      const l = Math.abs(p[1]!.x - p[0]!.x) / k,
        h = Math.abs(p[1]!.y - p[0]!.y) / k;
      return echelle ? `${cm(l)} × ${cm(h)} cm` : `${Math.round(l)} × ${Math.round(h)} px`;
    },
    verifier: (p) => (Math.abs(p[1]!.x - p[0]!.x) < 8 || Math.abs(p[1]!.y - p[0]!.y) < 8 ? 'Écartez davantage les deux coins.' : null),
  });
  c.width = c.height = 0;
  if (!res) return;
  const [p, q] = res.points as [P2, P2];
  const px = { x: Math.min(p.x, q.x) / k, y: Math.min(p.y, q.y) / k, l: Math.abs(q.x - p.x) / k, h: Math.abs(q.y - p.y) / k };
  const s = echelle ?? echelleEstimee ?? dernier.l / 12;
  // Sol inconnu : une baie haute comme une porte, et la plus basse de toutes, est au sol.
  const bas = (o: Baie['px']) => o.y + o.h;
  const laPlusBasse = baies.every((o) => o === b || bas(o.px) <= bas(px) + 0.25 * s);
  const auSol = solPx !== null ? (solPx - bas(px)) / s : laPlusBasse ? 0 : 9;
  // Une fenetre recadree jusqu'au sol (une porte que le reperage avait coupee) devient une porte.
  const propose = classer(auSol, px.l / s, px.h / s);
  const type = b && !(b.type === 'fenetre' && propose !== 'fenetre') ? b.type : propose;
  const nouvelle: Baie = { type, x: 0, y: 0, l: 0, h: 0, carreaux: 0, px };
  if (b && i !== undefined) baies[i] = nouvelle;
  else baies.push(nouvelle);
  if (type !== 'fenetre' || (b && b.type !== 'fenetre')) resituerSol();
  baiesCorrigees = true;
  journal(b ? `baie ${(i ?? 0) + 1} recadrée` : 'baie ajoutée');
  majBaies();
}

/** Les cotes en CSV (separateur point-virgule, virgule decimale : ce qu'ouvre un tableur francais). */
function cotesCsv(): File | null {
  if (!echelle || !baies.length || !dernier) return null;
  const lignes = [['N°', 'Type', 'Largeur (cm)', 'Hauteur (cm)', 'Depuis la gauche (m)', 'Appui (m)'].join(';')];
  baies.forEach((b, i) => {
    const c = cotes(b)!;
    lignes.push([String(i + 1), NOMS_BAIES[b.type] ?? b.type, cm(b.px.l), cm(b.px.h), fr(c.x, 2), c.appui !== null ? fr(c.appui, 2) : ''].join(';'));
  });
  return new File(['﻿' + lignes.join('\r\n') + '\r\n'], `${dernier.nom}_cotes.csv`, { type: 'text/csv' });
}

/* ---------- l'echelle (facultative) et les mesures ---------- */

/** Pixels du resultat par metre, une fois une longueur connue posee dessus. */
let echelle: number | null = null;

function majEchelle() {
  const t = $('echelle-etat');

  $<HTMLButtonElement>('mesurer').disabled = !echelle;
  $('bloc-barre').hidden = !echelle;
  if (!echelle || !dernier) {
    t.textContent = 'Sans échelle : les proportions sont justes, les dimensions inconnues. Posez une longueur connue (une porte, une fenêtre, la largeur du mur) pour coter.';
    return;
  }
  t.textContent = `Échelle : ${fr(echelle, 0)} px par mètre (1 px = ${fr(1000 / echelle, 1)} mm). L’image couvre ${fr(dernier.l / echelle, 2)} × ${fr(dernier.h / echelle, 2)} m.`;
}

/** Deux points sur le resultat : une cote connue (echelle) ou a mesurer. */
async function deuxPoints(mode: 'echelle' | 'mesure') {
  if (!dernier) return;
  const c = document.createElement('canvas');
  const k = reduction(c, 2400);
  const pleine = (p: P2[]) => Math.hypot((p[1]!.x - p[0]!.x) / k, (p[1]!.y - p[0]!.y) / k);
  const res = await editer({
    image: c,
    points: [
      { x: c.width * 0.3, y: c.height * 0.6 },
      { x: c.width * 0.7, y: c.height * 0.6 },
    ],
    forme: 'segment',
    noms: ['première extrémité', 'seconde extrémité'],
    consigne:
      mode === 'echelle'
        ? 'Posez les deux extrémités d’une longueur que vous connaissez (largeur d’une porte, d’une fenêtre, du mur), puis saisissez-la.'
        : 'Posez les deux extrémités de ce que vous voulez mesurer. La mesure est juste dans le plan du mur.',
    ...(mode === 'echelle' ? { champ: { libelle: 'Longueur réelle (m)', valeur: '' } } : {}),
    mesure: (p) => (mode === 'mesure' && echelle ? `${fr(pleine(p) / echelle, 2)} m` : `${fr(pleine(p), 0)} px sur l’image`),
    verifier: (p, v) => (mode === 'echelle' && !(v && v > 0) ? 'Saisissez la longueur réelle, en mètres.' : pleine(p) < 10 ? 'Écartez davantage les deux points.' : null),
    valider: mode === 'echelle' ? 'Appliquer' : 'Fermer',
  });
  c.width = c.height = 0;
  if (!res || mode !== 'echelle' || !res.valeur) return;
  echelle = pleine(res.points) / res.valeur;
  journal(`échelle : ${fr(res.valeur, 2)} m = ${fr(pleine(res.points), 0)} px`);
  majEchelle();
  // L'echelle affine le reperage (tailles admises) ; des baies corrigees a la main sont gardees.
  if ($<HTMLInputElement>('ch-ouvertures').checked && !baiesCorrigees) await reperer();
  else majBaies();
}

/** La barre d'echelle, dessinee en bas a gauche de l'image enregistree. */
function dessinerBarre(ctx: CanvasRenderingContext2D, l: number, h: number, pxm: number) {
  const cible = (l * 0.2) / pxm;
  const pas = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50];
  const m = pas.reduce((a, b) => (Math.abs(b - cible) < Math.abs(a - cible) ? b : a));
  const lb = m * pxm,
    u = Math.max(8, Math.round(Math.min(l, h) * 0.012)),
    marge = u * 2;
  const x = marge,
    y = h - marge - u * 4;
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.fillRect(x - u, y - u * 3.2, lb + u * 2, u * 6.2);
  ctx.fillStyle = '#111';
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 ? '#fff' : '#111';
    ctx.fillRect(x + (lb * i) / 4, y, lb / 4, u);
  }
  ctx.strokeStyle = '#111';
  ctx.lineWidth = Math.max(1, u / 6);
  ctx.strokeRect(x, y, lb, u);
  ctx.fillStyle = '#111';
  ctx.font = `600 ${Math.round(u * 2)}px system-ui, sans-serif`;
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${String(m).replace('.', ',')} m`, x, y - u * 0.4);
}

function enFichier(type: 'image/jpeg' | 'image/png'): Promise<File | null> {
  if (!dernier) return Promise.resolve(null);
  const { sortie, l, h, nom } = dernier;
  const c = document.createElement('canvas');
  c.width = l;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.putImageData(new ImageData(sortie as Uint8ClampedArray<ArrayBuffer>, l, h), 0, 0);
  if (baies.length && $<HTMLInputElement>('ch-ouvertures').checked) dessinerBaies(ctx, 1);
  if (echelle && $<HTMLInputElement>('ch-barre').checked) dessinerBarre(ctx, l, h, echelle);
  const nomFinal = echelle ? `${nom}_${Math.round(echelle)}pxm` : nom;
  return new Promise((r) =>
    c.toBlob(
      (b) => {
        c.width = c.height = 0;
        r(b ? new File([b], nomFinal + (type === 'image/png' ? '.png' : '.jpg'), { type }) : null);
      },
      type,
      0.92,
    ),
  );
}

// Publiee sur claude.ai, la page vit dans un cadre qui bloque les liens de telechargement : elle
// passe alors par la capacite `downloads` de l'hote. Ouverte seule, un lien suffit.
interface Telechargements {
  save(r: { filename: string; data: Blob }): Promise<unknown>;
}
const hote = (window as unknown as { claude?: { use?: (n: string) => Promise<unknown> } }).claude;
const telechargements: Promise<Telechargements | null> = hote?.use ? hote.use('downloads').then((d) => (d as Telechargements | null) ?? null, () => null) : Promise.resolve(null);

async function enregistrer(type: 'image/jpeg' | 'image/png') {
  message('etat-resultat', 'Préparation du fichier…');
  const f = await enFichier(type);
  if (!f) return message('etat-resultat', 'Le fichier n’a pas pu être produit (mémoire insuffisante ?). Essayez la résolution « Moitié ».', 'alerte');
  await offrir(f);
}

/** Donne un fichier a l'utilisateur : par l'hote (page publiee) ou par un lien (page seule). */
async function offrir(f: File) {
  const dl = await telechargements;
  if (dl) {
    try {
      await dl.save({ filename: f.name, data: f });
      message('etat-resultat', `« ${f.name} » enregistré (${fr(f.size / 1_048_576, 1)} Mo).`, 'bon');
    } catch (e) {
      const code = (e as { code?: string }).code;
      message('etat-resultat', code === 'declined' ? 'Enregistrement annulé.' : 'L’enregistrement a échoué ; réessayez dans un instant.', code === 'declined' ? 'info' : 'alerte');
    }
    return;
  }
  if (hote) return message('etat-resultat', 'L’enregistrement n’est pas disponible ici : ouvrez la page dans claude.ai ou le fichier facade.html.', 'alerte');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(f);
  a.download = f.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
  message('etat-resultat', `« ${f.name} » enregistré (${f.size < 1_048_576 ? fr(f.size / 1024, 0) + ' Ko' : fr(f.size / 1_048_576, 1) + ' Mo'}).`, 'bon');
}

async function partager() {
  message('etat-resultat', 'Préparation du fichier…');
  const f = await enFichier('image/jpeg');
  if (!f) return message('etat-resultat', 'Le fichier n’a pas pu être produit.', 'alerte');
  try {
    await navigator.share({ files: [f], title: 'Façade redressée' });
    message('etat-resultat', 'Partagée.', 'bon');
  } catch (e) {
    message('etat-resultat', (e as Error).name === 'AbortError' ? '' : 'Le partage a échoué : utilisez « Enregistrer ».', 'alerte');
  }
}

/* ---------- demarrage ---------- */

function demarrer() {
  for (const id of ['prendre', 'importer']) {
    const input = $<HTMLInputElement>(id);
    input.addEventListener('click', () => journal(`bouton « ${id === 'prendre' ? 'Prendre une photo' : 'Importer'} » touché`));
    input.addEventListener('change', async () => {
      const f = input.files;
      // Copie avant de vider le champ : sur certains navigateurs, la liste se vide avec lui.
      const copie = f ? Array.from(f) : [];
      input.value = '';
      await ajouter(copie.length ? copie : f, id === 'prendre' ? 'appareil photo' : 'import');
    });
  }
  const obj = $<HTMLSelectElement>('ch-objectif'),
    champ = $<HTMLInputElement>('ch-champ'),
    qual = $<HTMLSelectElement>('ch-qualite');
  obj.value = reglages.objectif;
  champ.value = reglages.champ;
  qual.value = reglages.qualite;
  const majChamp = () => {
    $('bloc-champ').hidden = obj.value !== 'valeur';
  };
  majChamp();
  const appliquer = () => {
    reglages.objectif = obj.value;
    reglages.champ = champ.value;
    reglages.qualite = qual.value;
    garder();
    majChamp();
    if (occupe) return;
    occupe = true;
    void redresserTout()
      .catch(erreur)
      .finally(() => {
        occupe = false;
        majPhotos();
      });
  };
  obj.addEventListener('change', appliquer);
  champ.addEventListener('change', appliquer);
  qual.addEventListener('change', appliquer);
  $('fusionner').addEventListener('click', fusionner);
  $('mettre-echelle').addEventListener('click', () => void deuxPoints('echelle'));
  $('mesurer').addEventListener('click', () => void deuxPoints('mesure'));
  $('ch-ouvertures').addEventListener('change', () => {
    if ($<HTMLInputElement>('ch-ouvertures').checked && !baies.length) void reperer();
    else majBaies();
  });
  $('ajouter-baie').addEventListener('click', () => void poserBaie());
  $('reperer-encore').addEventListener('click', () => void reperer());
  $('exporter-cotes').addEventListener('click', () => {
    const f = cotesCsv();
    if (f) void offrir(f);
  });
  $('tout-effacer').addEventListener('click', async () => {
    if (occupe) return;
    // Pas de confirm() (refuse dans une page publiee) : un second appui confirme.
    const b = $('tout-effacer');
    if (b.dataset.armer !== '1') {
      b.dataset.armer = '1';
      b.textContent = 'Toucher encore pour tout effacer';
      setTimeout(() => {
        b.dataset.armer = '';
        b.textContent = 'Tout effacer';
      }, 4000);
      return;
    }
    b.dataset.armer = '';
    b.textContent = 'Tout effacer';
    for (const e of entrees) URL.revokeObjectURL(e.url);
    entrees.length = 0;
    synchroniser();
    await stockage.vider();
    journal('photos effacées');
    message('etat-photos', '');
    majPhotos();
  });
  $('enregistrer').addEventListener('click', () => enregistrer('image/jpeg'));
  $('enregistrer-png').addEventListener('click', () => enregistrer('image/png'));
  let peutPartager = false;
  // Le partage natif est refuse dans le cadre d'une page publiee.
  if (!hote) try {
    peutPartager = typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([''], 'a.jpg', { type: 'image/jpeg' })] });
  } catch {
    peutPartager = false;
  }
  $('partager').hidden = !peutPartager;
  $('partager').addEventListener('click', partager);
  $('resultat').addEventListener('click', () => $('resultat-cadre').classList.toggle('plein'));
  $('journal-copier').addEventListener('click', async () => {
    const texte = lignesJournal.join('\n');
    try {
      await navigator.clipboard.writeText(texte);
      $('journal-copier').textContent = 'Copié';
    } catch {
      const r = document.createRange();
      r.selectNodeContents($('journal-texte'));
      const s = getSelection();
      s?.removeAllRanges();
      s?.addRange(r);
    }
  });
  journal(`calcul ${calcul.arrierePlan() ? 'en arrière-plan (Web Worker)' : 'sur la page'}`);
  journal(`page prête · ${navigator.userAgent} · ${window.self !== window.top ? 'dans un cadre (page publiée)' : 'page seule'} · écran ${screen.width} × ${screen.height} × ${devicePixelRatio}`);
  majPhotos();
  majEchelle();
  void restaurer().catch(erreur);
}

demarrer();

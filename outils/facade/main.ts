// facade.html : l'interface. On prend (ou importe) ses photos, la page fait le reste : objectif lu
// dans l'EXIF (ou estime), redressement automatique de chaque photo, fusion, rendu a la resolution
// des photos, enregistrement. Le calcul est dans auto.ts.

import { focale35mm, champDepuisFocale35 } from '../../src/facade/exif.js';
import { CHAMP_GRAND_COTE_DEFAUT } from '../../src/facade/cadrage.js';
import {
  segmentsPhoto,
  estimerChamp,
  redresserPhoto,
  versGris,
  vueRedressee,
  signature,
  placer,
  cadreFusion,
  preparerRendu,
  regionUtile,
  type Gris,
  type Redressement,
  type Segment,
  type Source,
} from './auto.js';

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
  vignette: HTMLCanvasElement;
  fond: HTMLCanvasElement;
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
  message('erreur', 'Erreur : ' + t + ' — si elle se répète, essayez la résolution « Légère ».', 'alerte');
}
window.addEventListener('error', (e) => erreur(e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => erreur(e.reason));

async function decoder(f: File): Promise<{ img: HTMLImageElement; url: string }> {
  const url = URL.createObjectURL(f);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    await new Promise<void>((ok, ko) => {
      if (img.complete && img.naturalWidth) return ok();
      img.onload = () => ok();
      img.onerror = () => ko(new Error(`« ${f.name} » n’a pas pu être lue (format HEIC ? réglez l’appareil photo sur « Le plus compatible »)`));
    });
  }
  return { img, url };
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

async function charger(f: File): Promise<Photo> {
  const { img, url } = await decoder(f);
  try {
    const L = img.naturalWidth,
      H = img.naturalHeight;
    const k = Math.min(1, ANALYSE_MAX / Math.max(L, H));
    const l = Math.round(L * k),
      h = Math.round(H * k);
    const gris = versGris({ largeur: l, hauteur: h, donnees: pixels(img, 0, 0, L, H, l, h) });
    const fond = document.createElement('canvas');
    const kv = 240 / Math.max(L, H);
    fond.width = Math.round(L * kv);
    fond.height = Math.round(H * kv);
    fond.getContext('2d')!.drawImage(img, 0, 0, fond.width, fond.height);
    let f35: number | null = null;
    try {
      f35 = focale35mm(await f.slice(0, 262_144).arrayBuffer());
    } catch {
      f35 = null;
    }
    await attendre();
    const segs = segmentsPhoto(gris, k);
    const champEstime = f35 ? null : estimerChamp(segs, k, L, H);
    const p: Photo = { id: suivant++, fichier: f, L, H, gris, k, segs, f35, champEstime, champ: CHAMP_GRAND_COTE_DEFAUT, origineChamp: '', red: null, vignette: document.createElement('canvas'), fond };
    return p;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Le champ de chaque photo : l'EXIF, sinon le reglage, sinon l'estimation commune aux photos. */
function choisirChamps() {
  const estimes = photos.map((p) => p.champEstime).filter((c): c is number => c !== null).sort((a, b) => a - b);
  const median = estimes.length ? estimes[Math.floor(estimes.length / 2)]! : null;
  const regle = parseFloat(reglages.champ.replace(',', '.'));
  for (const p of photos) {
    if (p.f35) {
      p.champ = champDepuisFocale35(p.f35);
      p.origineChamp = `${p.f35} mm (EXIF)`;
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

function redresser(p: Photo) {
  p.red = redresserPhoto(p.segs, p.k, p.L, p.H, p.champ);
  const v = p.vignette;
  v.width = p.fond.width;
  v.height = p.fond.height;
  const ctx = v.getContext('2d')!;
  ctx.drawImage(p.fond, 0, 0);
  const kv = v.width / p.L;
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
}

function majPhotos() {
  const liste = $('photos');
  liste.replaceChildren();
  photos.forEach((p, i) => {
    const li = document.createElement('li');
    li.className = 'photo';
    p.vignette.className = 'vignette';
    p.vignette.setAttribute('role', 'img');
    p.vignette.setAttribute('aria-label', `Photo ${i + 1}, lignes détectées`);
    const corps = document.createElement('div');
    corps.className = 'photo-corps';
    const t = document.createElement('strong');
    t.textContent = `Photo ${i + 1}`;
    const a = document.createElement('span');
    a.className = 'discret';
    a.textContent = `${p.L} × ${p.H} px · objectif ${fr(p.champ)}° ${p.origineChamp}`;
    const b = document.createElement('span');
    const r = p.red;
    b.className = r && !r.avis.length ? 'etat bon' : 'etat';
    b.textContent = r ? (r.avis.length ? r.avis.join(' ; ') : `${r.verticales.length} verticales, ${r.horizontales.length} horizontales`) : '';
    corps.append(t, a, b);
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'petit';
    x.textContent = '✕';
    x.title = x.ariaLabel = `Retirer la photo ${i + 1}`;
    x.addEventListener('click', () => {
      photos.splice(i, 1);
      majPhotos();
    });
    li.append(p.vignette, corps, x);
    liste.append(li);
  });
  $('photos-vide').hidden = photos.length > 0;
  $<HTMLButtonElement>('fusionner').disabled = occupe || !photos.length;
}

async function ajouter(fichiers: FileList | null) {
  if (!fichiers?.length || occupe) return;
  occupe = true;
  message('erreur', '');
  try {
    const liste = Array.from(fichiers);
    for (let i = 0; i < liste.length; i++) {
      message('etat-photos', `Analyse de la photo ${i + 1} sur ${liste.length}…`);
      await attendre();
      photos.push(await charger(liste[i]!));
    }
    choisirChamps();
    photos.forEach(redresser);
    message('etat-photos', '');
  } catch (e) {
    message('etat-photos', '');
    erreur(e);
  } finally {
    occupe = false;
    majPhotos();
  }
}

/* ---------- la fusion ---------- */

let dernier: { sortie: Uint8ClampedArray; l: number; h: number; nom: string } | null = null;

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
    choisirChamps();
    photos.forEach(redresser);
    majPhotos();
    const reds = photos.map((p) => p.red!);
    let T = reds.map((_, i) => (i === 0 ? { a: 1, b: 0, tx: 0, ty: 0 } : null));
    let gains = reds.map(() => 1);
    if (photos.length > 1) {
      // Vues de travail a ~900 px, a la meme echelle d'une photo a l'autre (meme focale relative).
      const cs = reds.map((r) => 900 / Math.max(r.boite.x1 - r.boite.x0, r.boite.y1 - r.boite.y0) / r.cam.f).sort((a, b) => a - b);
      const c = cs[Math.floor(cs.length / 2)]!;
      const vues = [];
      const sigs = [];
      for (let i = 0; i < photos.length; i++) {
        await etape(`Points homologues, photo ${i + 1} sur ${photos.length}…`, (0.3 * i) / photos.length);
        const r = reds[i]!;
        const fa = Math.min(r.cam.f * c, 1200 / Math.max(r.boite.x1 - r.boite.x0, r.boite.y1 - r.boite.y0));
        const v = vueRedressee(r, photos[i]!.gris, photos[i]!.k, fa);
        vues.push(v);
        sigs.push(signature(v));
      }
      await etape('Assemblage des photos…', 0.3);
      const pl = placer(vues, sigs);
      T = pl.T;
      gains = pl.gains;
    }
    const exclues = T.map((t, i) => (t ? -1 : i)).filter((i) => i >= 0);
    const cadre = cadreFusion(reds, T);
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
    const rendu = preparerRendu(reds, T, gains, sources, cadre, px);
    const pas = Math.max(4, Math.round(300_000 / rendu.largeur));
    for (let y = 0; y < rendu.hauteur; y += pas) {
      rendu.lignes(y, y + pas);
      await etape(`Redressement : ${rendu.largeur} × ${rendu.hauteur} px…`, 0.45 + 0.55 * Math.min(1, (y + pas) / rendu.hauteur));
    }
    sources.length = 0;
    const date = new Date();
    const z = (n: number) => String(n).padStart(2, '0');
    dernier = { sortie: rendu.sortie, l: rendu.largeur, h: rendu.hauteur, nom: `facade_${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}_${z(date.getHours())}${z(date.getMinutes())}` };
    apercu();
    const lignes = [
      `${rendu.largeur} × ${rendu.hauteur} px (${fr((rendu.largeur * rendu.hauteur) / 1e6, 1)} Mpx), à ${Math.round((px / cadre.native) * 100)} % de la résolution des photos.`,
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
    $('resultat-bloc').hidden = false;
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

/** Apercu a l'ecran : une image reduite, pour ne pas tenir un second canevas geant. */
function apercu() {
  if (!dernier) return;
  const { sortie, l, h } = dernier;
  const k = Math.min(1, 1600 / Math.max(l, h));
  const c = $<HTMLCanvasElement>('resultat');
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
}

function enFichier(type: 'image/jpeg' | 'image/png'): Promise<File | null> {
  if (!dernier) return Promise.resolve(null);
  const { sortie, l, h, nom } = dernier;
  const c = document.createElement('canvas');
  c.width = l;
  c.height = h;
  c.getContext('2d')!.putImageData(new ImageData(sortie as Uint8ClampedArray<ArrayBuffer>, l, h), 0, 0);
  return new Promise((r) =>
    c.toBlob(
      (b) => {
        c.width = c.height = 0;
        r(b ? new File([b], nom + (type === 'image/png' ? '.png' : '.jpg'), { type }) : null);
      },
      type,
      0.92,
    ),
  );
}

async function enregistrer(type: 'image/jpeg' | 'image/png') {
  message('etat-resultat', 'Préparation du fichier…');
  const f = await enFichier(type);
  if (!f) return message('etat-resultat', 'Le fichier n’a pas pu être produit (mémoire insuffisante ?). Essayez la résolution « Moitié ».', 'alerte');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(f);
  a.download = f.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
  message('etat-resultat', `« ${f.name} » enregistré (${fr(f.size / 1_048_576, 1)} Mo).`, 'bon');
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
    input.addEventListener('change', async () => {
      await ajouter(input.files);
      input.value = '';
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
    choisirChamps();
    photos.forEach(redresser);
    majPhotos();
  };
  obj.addEventListener('change', appliquer);
  champ.addEventListener('change', appliquer);
  qual.addEventListener('change', appliquer);
  $('fusionner').addEventListener('click', fusionner);
  $('enregistrer').addEventListener('click', () => enregistrer('image/jpeg'));
  $('enregistrer-png').addEventListener('click', () => enregistrer('image/png'));
  let peutPartager = false;
  try {
    peutPartager = typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([''], 'a.jpg', { type: 'image/jpeg' })] });
  } catch {
    peutPartager = false;
  }
  $('partager').hidden = !peutPartager;
  $('partager').addEventListener('click', partager);
  $('resultat').addEventListener('click', () => $('resultat-cadre').classList.toggle('plein'));
  majPhotos();
}

demarrer();

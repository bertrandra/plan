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
    f35 = focale35mm(await f.slice(0, 262_144).arrayBuffer());
  } catch {
    f35 = null;
  }
  journal(`photo ${e.id} : EXIF ${f35 ? f35 + ' mm (24×36)' : 'sans focale'}`);
  await attendre();
  const segs = segmentsPhoto(gris, k);
  const champEstime = f35 ? null : estimerChamp(segs, k, L, H);
  journal(`photo ${e.id} : ${segs.length} segments, champ estimé ${champEstime ? fr(champEstime) + '°' : '—'} (${Math.round(performance.now() - debut)} ms)`);
  return { id: e.id, fichier: f, L, H, gris, k, segs, f35, champEstime, champ: CHAMP_GRAND_COTE_DEFAUT, origineChamp: '', red: null, vignette: document.createElement('canvas') };
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

/** Redresse une photo et trace ses lignes sur un calque transparent, pose sur la photo. */
function redresser(p: Photo) {
  p.red = redresserPhoto(p.segs, p.k, p.L, p.H, p.champ);
  const v = p.vignette;
  const kv = 240 / Math.max(p.L, p.H);
  v.width = Math.round(p.L * kv);
  v.height = Math.round(p.H * kv);
  const ctx = v.getContext('2d')!;
  ctx.clearRect(0, 0, v.width, v.height);
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
      b.textContent = r ? (r.avis.length ? r.avis.join(' ; ') : `${r.verticales.length} verticales, ${r.horizontales.length} horizontales`) : '';
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
      synchroniser();
      majPhotos();
    });
    li.append(cadre, corps, x);
    liste.append(li);
  });
  $('photos-vide').hidden = entrees.length > 0;
  $<HTMLButtonElement>('fusionner').disabled = occupe || !photos.length;
}

async function ajouter(fichiers: FileList | null, source: string) {
  journal(`${source} : ${fichiers?.length ?? 0} fichier(s) reçu(s)${fichiers?.length ? ' — ' + Array.from(fichiers).map((f) => `${f.name || 'sans nom'} (${f.type || 'type inconnu'}, ${fr(f.size / 1_048_576, 1)} Mo)`).join(', ') : ''}`);
  if (!fichiers?.length) {
    message('etat-photos', 'Aucune photo n’est parvenue à la page.', 'alerte');
    return;
  }
  // Les photos s'affichent tout de suite ; l'analyse suit.
  const nouvelles: Entree[] = Array.from(fichiers).map((f) => ({ id: suivant++, fichier: f, url: URL.createObjectURL(f), etat: 'attente', texte: 'En attente d’analyse…', photo: null }));
  entrees.push(...nouvelles);
  majPhotos();
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
    choisirChamps();
    photos.forEach(redresser);
  } catch (err) {
    erreur(err);
  } finally {
    occupe = false;
    synchroniser();
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

/** Une FileList a partir d'un tableau (DataTransfer), ou le tableau tel quel. */
function listeDe(t: File[]): FileList {
  try {
    const d = new DataTransfer();
    for (const f of t) d.items.add(f);
    return d.files;
  } catch {
    return t as unknown as FileList;
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
      await ajouter(copie.length ? listeDe(copie) : f, id === 'prendre' ? 'appareil photo' : 'import');
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
  journal(`page prête · ${navigator.userAgent} · ${window.self !== window.top ? 'dans un cadre (page publiée)' : 'page seule'} · écran ${screen.width} × ${screen.height} × ${devicePixelRatio}`);
  majPhotos();
}

demarrer();

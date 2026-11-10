// Le fuseau horaire du lieu du projet (MD/spec-ouvrages.md, « Le soleil et l'ombre » : le fuseau, decide le 29 octobre 2026).
//
// L'heure que la personne tape (date et hh:mm) est l'heure legale du lieu de la parcelle, pas celle de l'ordinateur ni toujours
// celle de Paris : a La Reunion, 15 h est 15 h a La Reunion. Le fuseau se deduit de la latitude et de la longitude, sans reseau,
// par une table : la France metropolitaine (un contour grossier) et la Corse, les outre-mer par des boites, quelques voisins par
// des boites plus grossieres encore (leur heure legale est celle de Paris, hors le Portugal qu'aucune boite ne couvre : seul
// le nom affiche peut se tromper pres d'une frontiere). Ailleurs, le repli est Europe/Paris, et l'interface le dit.
//
// Le decalage se lit pour l'instant meme, par `Intl.DateTimeFormat` (`timeZoneName: 'shortOffset'`), qui connait l'heure d'ete
// de chaque pays (y compris son histoire). Un moteur sans les fuseaux d'ICU retombe sur la regle ecrite ici : celle de l'Union
// europeenne pour l'Europe (la regle francaise d'avant, au bit pres), celle des Etats-Unis pour Miquelon, un decalage fixe
// ailleurs.

/** Le fuseau d'un lieu : son nom IANA, le pays ou le territoire qu'il dit, et s'il n'est qu'un repli. */
export interface FuseauLieu {
  zone: string;
  /** Le territoire, tel qu'on le lit dans « heure légale de … ». */
  nom: string;
  /** Vrai quand le lieu n'est dans aucune table : l'heure est celle de Paris, faute de mieux. */
  repli: boolean;
}

/** Ce qu'il faut sans `Intl` : le decalage d'hiver, en heures, et la regle d'heure d'ete. */
interface RegleFixe { base: number; ete: 'ue' | 'usa' | null }

const PARIS: RegleFixe = { base: 1, ete: 'ue' };

const REGLES: Record<string, RegleFixe> = {
  'Europe/Paris': PARIS,
  'Europe/Monaco': { base: 1, ete: 'ue' },
  'Europe/Andorra': { base: 1, ete: 'ue' },
  'Europe/Brussels': { base: 1, ete: 'ue' },
  'Europe/Luxembourg': { base: 1, ete: 'ue' },
  'Europe/Zurich': { base: 1, ete: 'ue' },
  'Europe/Berlin': { base: 1, ete: 'ue' },
  'Europe/Rome': { base: 1, ete: 'ue' },
  'Europe/Madrid': { base: 1, ete: 'ue' },
  'Atlantic/Canary': { base: 0, ete: 'ue' },
  'America/Guadeloupe': { base: -4, ete: null },
  'America/Martinique': { base: -4, ete: null },
  'America/Cayenne': { base: -3, ete: null },
  'America/Miquelon': { base: -3, ete: 'usa' },
  'Indian/Reunion': { base: 4, ete: null },
  'Indian/Mayotte': { base: 3, ete: null },
  'Pacific/Tahiti': { base: -10, ete: null },
  'Pacific/Marquesas': { base: -9.5, ete: null },
  'Pacific/Gambier': { base: -9, ete: null },
  'Pacific/Noumea': { base: 11, ete: null },
  'Pacific/Wallis': { base: 12, ete: null }
};

/** Une boite : longitude ouest, latitude sud, longitude est, latitude nord (degres). */
type Boite = readonly [number, number, number, number];
interface Territoire { zone: string; nom: string; boites: readonly Boite[] }

// Lus dans l'ordre : le premier qui contient le point l'emporte. Les petits d'abord (Monaco et Andorre sont dans le contour de
// la France), les outre-mer ensuite, les voisins apres la France (leurs boites la recouvrent).
const AVANT_LA_FRANCE: readonly Territoire[] = [
  { zone: 'Europe/Monaco', nom: 'Monaco', boites: [[7.40, 43.72, 7.44, 43.76]] },
  { zone: 'Europe/Andorra', nom: 'l’Andorre', boites: [[1.40, 42.42, 1.79, 42.66]] },
  { zone: 'Europe/Paris', nom: 'la Corse', boites: [[8.50, 41.30, 9.60, 43.10]] },
  { zone: 'America/Guadeloupe', nom: 'la Guadeloupe', boites: [[-61.85, 15.80, -61.00, 16.55]] },
  { zone: 'America/Martinique', nom: 'la Martinique', boites: [[-61.25, 14.35, -60.80, 14.90]] },
  // Saint-Martin et Saint-Barthelemy suivent l'heure de la Guadeloupe (UTC-4, sans heure d'ete).
  { zone: 'America/Guadeloupe', nom: 'Saint-Martin', boites: [[-63.16, 18.03, -62.96, 18.13]] },
  { zone: 'America/Guadeloupe', nom: 'Saint-Barthélemy', boites: [[-62.95, 17.86, -62.78, 17.97]] },
  { zone: 'America/Cayenne', nom: 'la Guyane', boites: [[-54.60, 2.10, -51.60, 5.80]] },
  { zone: 'America/Miquelon', nom: 'Saint-Pierre-et-Miquelon', boites: [[-56.45, 46.70, -56.10, 47.15]] },
  { zone: 'Indian/Reunion', nom: 'La Réunion', boites: [[55.20, -21.42, 55.85, -20.85]] },
  { zone: 'Indian/Mayotte', nom: 'Mayotte', boites: [[44.95, -13.05, 45.35, -12.60]] },
  // La Polynesie a trois fuseaux : les Marquises (UTC-9:30) et les Gambier (UTC-9) dans celui de Tahiti (UTC-10).
  { zone: 'Pacific/Marquesas', nom: 'les Marquises', boites: [[-141.0, -11.0, -138.0, -7.5]] },
  { zone: 'Pacific/Gambier', nom: 'les Gambier', boites: [[-135.3, -23.4, -134.4, -22.8]] },
  { zone: 'Pacific/Tahiti', nom: 'la Polynésie française', boites: [[-155.0, -28.0, -134.4, -7.0]] },
  { zone: 'Pacific/Noumea', nom: 'la Nouvelle-Calédonie', boites: [[163.5, -23.0, 168.2, -19.5]] },
  { zone: 'Pacific/Wallis', nom: 'Wallis-et-Futuna', boites: [[-178.25, -14.4, -176.1, -13.15]] }
];

const APRES_LA_FRANCE: readonly Territoire[] = [
  { zone: 'Europe/Luxembourg', nom: 'le Luxembourg', boites: [[5.73, 49.44, 6.53, 50.19]] },
  { zone: 'Europe/Brussels', nom: 'la Belgique', boites: [[2.54, 49.49, 6.41, 51.51]] },
  { zone: 'Europe/Zurich', nom: 'la Suisse', boites: [[5.95, 45.81, 10.50, 47.81]] },
  // L'Italie sans la Tunisie (Bizerte est a 37,3° N) : la botte et la Sardaigne, puis la Sicile.
  { zone: 'Europe/Rome', nom: 'l’Italie', boites: [[6.62, 37.50, 18.52, 47.10], [12.40, 36.60, 15.70, 38.30]] },
  { zone: 'Europe/Berlin', nom: 'l’Allemagne', boites: [[5.86, 47.27, 15.05, 55.06]] },
  // L'Espagne sans le Portugal (Europe/Lisbon, une heure de moins) ni l'Algerie (sans heure d'ete) : la Galice et les
  // Asturies, l'ouest de l'Andalousie a la Catalogne, l'est au-dessus de 38,6° N (les Baleares). Les Canaries a part.
  { zone: 'Europe/Madrid', nom: 'l’Espagne', boites: [[-9.40, 41.85, -6.20, 43.80], [-6.20, 35.90, 0.00, 43.80], [0.00, 38.60, 4.40, 43.80]] },
  { zone: 'Atlantic/Canary', nom: 'les Canaries', boites: [[-18.20, 27.60, -13.40, 29.50]] }
];

// La France metropolitaine continentale, en longitude et latitude, dans le sens des aiguilles d'une montre depuis la mer du
// Nord. Les frontieres a quelques kilometres pres (Lille, Forbach, Wissembourg, Strasbourg, Mulhouse, Delle, Annemasse,
// Thonon, Chamonix, Briancon, Menton, Perpignan, Hendaye dedans ; Mouscron, Tournai, Mons, Arlon, Sarrebruck, Kehl, Bale,
// Porrentruy, Geneve, Lausanne, Martigny, Courmayeur, Vintimille, Puigcerda dehors) ; les cotes poussees au large pour
// garder les iles (Ouessant, Belle-Ile, Re, Oleron, Chausey), sans Jersey ni Aurigny.
const FRANCE: readonly (readonly [number, number])[] = [
  [2.40, 51.15], [2.56, 51.09], [2.63, 50.95], [2.90, 50.70], [3.10, 50.78], [3.25, 50.72], [3.29, 50.53], [3.62, 50.49],
  [3.70, 50.32], [4.03, 50.36], [4.16, 50.26], [4.13, 50.13], [4.43, 49.94], [4.68, 49.99], [4.83, 50.16], [4.87, 50.15],
  [4.80, 49.95], [4.85, 49.79], [5.10, 49.77], [5.40, 49.62], [5.47, 49.50], [5.82, 49.55], [6.10, 49.46], [6.37, 49.46],
  [6.56, 49.36], [6.73, 49.17], [6.88, 49.21], [7.03, 49.15], [7.10, 49.15], [7.36, 49.17], [7.54, 49.09], [7.80, 49.07],
  [8.07, 49.02], [8.23, 48.97], [8.10, 48.80], [7.80, 48.58], [7.70, 48.30], [7.58, 48.00], [7.54, 47.75], [7.59, 47.58],
  [7.39, 47.43], [7.00, 47.48], [6.88, 47.35], [6.68, 47.12], [6.43, 46.92], [6.13, 46.60], [6.06, 46.41], [6.12, 46.30],
  [5.97, 46.21], [6.03, 46.14], [6.18, 46.16], [6.30, 46.26], [6.50, 46.43], [6.80, 46.42], [6.79, 46.30], [7.04, 46.10],
  [6.80, 45.83], [6.97, 45.64], [7.13, 45.40], [7.07, 45.22], [6.62, 45.10], [6.75, 44.90], [7.03, 44.70], [6.86, 44.50],
  [6.95, 44.33], [7.20, 44.20], [7.43, 44.13], [7.71, 44.06], [7.53, 43.79], [7.53, 43.70], [7.40, 43.55], [6.90, 43.35],
  [6.40, 43.00], [5.80, 42.95], [5.00, 43.20], [4.30, 43.30], [3.50, 43.10], [3.20, 42.60], [3.20, 42.43], [3.17, 42.43],
  [2.95, 42.47], [2.68, 42.34], [2.48, 42.34], [2.10, 42.37], [1.96, 42.45], [1.78, 42.58], [1.45, 42.60], [1.00, 42.78],
  [0.70, 42.86], [0.30, 42.68], [-0.30, 42.84], [-0.75, 42.95], [-1.30, 43.05], [-1.45, 43.27], [-1.73, 43.30], [-1.79, 43.37],
  [-1.90, 43.45], [-1.60, 44.20], [-1.40, 45.00], [-1.60, 46.00], [-2.55, 46.60], [-3.50, 47.20], [-4.50, 47.70],
  [-5.30, 48.40], [-4.50, 48.80], [-3.50, 48.95], [-2.50, 48.75], [-1.95, 48.90], [-1.72, 49.20], [-1.95, 49.55],
  [-2.05, 49.75], [-1.20, 49.75], [-0.30, 49.45], [0.10, 49.60], [1.40, 50.10], [1.50, 50.90]
];

const dansBoite = (lon: number, lat: number, b: Boite): boolean => lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3];

function dansFrance(lon: number, lat: number): boolean {
  let dedans = false;
  for (let i = 0, j = FRANCE.length - 1; i < FRANCE.length; j = i++) {
    const a = FRANCE[i], b = FRANCE[j];
    if (!a || !b) continue;
    const [xi, yi] = a, [xj, yj] = b;
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}

const chercher = (liste: readonly Territoire[], lon: number, lat: number): Territoire | undefined =>
  liste.find(t => t.boites.some(b => dansBoite(lon, lat, b)));

/** Le fuseau de Paris, quand le lieu n'est dans aucune table. */
export const FUSEAU_REPLI: FuseauLieu = { zone: 'Europe/Paris', nom: 'France', repli: true };

// Une memoire, pas un etat : la meme reponse pour le meme lieu, retenue parce que la carte des ombres la demande a chaque point.
const lieuxConnus = new Map<string, FuseauLieu>();

/** Le fuseau du lieu (latitude, longitude en degres, est positif), sans reseau. */
export function fuseauDuLieu(latDeg: number, lonDeg: number): FuseauLieu {
  const cle = latDeg + ',' + lonDeg;
  const connu = lieuxConnus.get(cle);
  if (connu) return connu;
  let f: FuseauLieu;
  const avant = chercher(AVANT_LA_FRANCE, lonDeg, latDeg);
  if (avant) f = { zone: avant.zone, nom: avant.nom, repli: false };
  else if (dansFrance(lonDeg, latDeg)) f = { zone: 'Europe/Paris', nom: 'France', repli: false };
  else {
    const apres = chercher(APRES_LA_FRANCE, lonDeg, latDeg);
    f = apres ? { zone: apres.zone, nom: apres.nom, repli: false } : FUSEAU_REPLI;
  }
  if (lieuxConnus.size > 1000) lieuxConnus.clear();
  lieuxConnus.set(cle, f);
  return f;
}

/**
 * Ce que disent les champs de l'heure du soleil : « heure légale de La Réunion (Indian/Reunion) », et le repli quand il y en a
 * un. Une seule formulation pour l'inspecteur et les deux vues 3D.
 */
export function libelleHeureLegale(f: FuseauLieu): string {
  const de = /^(le |les )/.test(f.nom) ? f.nom.replace(/^le /, 'du ').replace(/^les /, 'des ') : 'de ' + f.nom;
  return 'Heure légale ' + de + ' (' + f.zone + ')' +
    (f.repli ? ', faute de connaître le fuseau de ce lieu' : '');
}

// --- Le decalage -----------------------------------------------------------------------------------------------------

// France (CET/CEST) : UTC+1 toute l'annee, UTC+2 entre le dernier dimanche de mars 01h UTC et le
// dernier dimanche d'octobre 01h UTC (regle DST europeenne) - calculee explicitement plutot que de
// faire confiance au fuseau de l'ordinateur qui fait tourner l'appli (qui peut etre ailleurs que
// la France, alors que Le Vesinet, lui, ne bouge pas). C'est le repli sans `Intl`.
export function decalageFuseauFrance(anneeRef: number, tsUTC: number): number {
  function dernierDimancheUTC(mois: number): number { // mois 0-index ; renvoie 01:00 UTC du dernier dimanche de ce mois
    const d = new Date(Date.UTC(anneeRef, mois+1, 1, 1, 0, 0));
    d.setUTCDate(d.getUTCDate() - (d.getUTCDay()||7));
    return d.getTime();
  }
  const debutEte = dernierDimancheUTC(2), finEte = dernierDimancheUTC(9);
  return (tsUTC >= debutEte && tsUTC < finEte) ? 2 : 1;
}

// Etats-Unis et Canada (Miquelon les suit) : du deuxieme dimanche de mars, 2 h locales d'hiver, au premier dimanche de
// novembre, 2 h locales d'ete.
function enEteUsa(base: number, tsUTC: number): boolean {
  const annee = new Date(tsUTC).getUTCFullYear();
  const dimanche = (mois: number, rang: number, heureLocale: number, decalage: number): number => {
    const premier = new Date(Date.UTC(annee, mois, 1)).getUTCDay();
    const jour = 1 + ((7 - premier) % 7) + 7 * (rang - 1);
    return Date.UTC(annee, mois, jour, heureLocale - decalage);
  };
  return tsUTC >= dimanche(2, 2, 2, base) && tsUTC < dimanche(10, 1, 2, base + 1);
}

/** Le decalage sans `Intl` : la regle ecrite, Paris pour un fuseau qu'elle ne connait pas. */
export function decalageSansIntl(zone: string, tsUTC: number): number {
  const r = REGLES[zone] ?? PARIS;
  if (r.ete === 'ue') return decalageFuseauFrance(new Date(tsUTC).getUTCFullYear(), tsUTC) - 1 + r.base;
  if (r.ete === 'usa') return r.base + (enEteUsa(r.base, tsUTC) ? 1 : 0);
  return r.base;
}

/** « GMT+2 », « GMT-9:30 », « GMT » ou « UTC+11 » en heures ; `null` si ce n'est pas lisible. */
export function lireDecalage(texte: string): number | null {
  const m = /^(?:GMT|UTC)(?:([+\-−])(\d{1,2})(?::(\d{2}))?)?$/.exec(texte.trim());
  if (!m) return null;
  if (!m[1]) return 0;
  const h = Number(m[2]) + Number(m[3] ?? 0) / 60;
  return m[1] === '+' ? h : -h;
}

const formats = new Map<string, Intl.DateTimeFormat | null>();
const memoire = new Map<string, number>();

function formatDe(zone: string): Intl.DateTimeFormat | null {
  const connu = formats.get(zone);
  if (connu !== undefined) return connu;
  let f: Intl.DateTimeFormat | null = null;
  try { f = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'shortOffset' }); } catch { f = null; }
  formats.set(zone, f);
  return f;
}

/**
 * Le decalage de l'heure legale de `zone` sur UTC, en heures, a l'instant `tsUTC` : lu par `Intl` (`shortOffset`), sinon par la
 * regle ecrite (`decalageSansIntl`). Retenu par quart d'heure : les changements d'heure tombent a l'heure ronde, et le lever
 * et le coucher en demandent 1 440 par jour.
 */
export function decalageFuseau(zone: string, tsUTC: number): number {
  const cle = zone + '|' + Math.floor(tsUTC / 900000);
  const connu = memoire.get(cle);
  if (connu !== undefined) return connu;
  let h: number | null = null;
  const f = formatDe(zone);
  if (f) {
    try { h = lireDecalage(f.formatToParts(new Date(tsUTC)).find(p => p.type === 'timeZoneName')?.value ?? ''); } catch { h = null; }
  }
  if (h === null) h = decalageSansIntl(zone, tsUTC);
  if (memoire.size > 20000) memoire.clear();
  memoire.set(cle, h);
  return h;
}

/**
 * Le decalage qui vaut pour une heure legale lue sur l'horloge du lieu (`heureLocaleUTC` : cette date et cette heure comme si
 * elles etaient UTC). Deux lectures : le decalage a cet instant, puis a l'instant qu'il donne. Une heure qui n'existe pas (le
 * matin du passage a l'heure d'ete) se lit avec le decalage d'avant ; une heure qui existe deux fois (le matin du retour), avec
 * celui d'apres.
 */
export function decalageALHeureLocale(zone: string, heureLocaleUTC: number): number {
  const d0 = decalageFuseau(zone, heureLocaleUTC);
  return decalageFuseau(zone, heureLocaleUTC - d0 * 3600000);
}

/** Pour les essais : oublier ce qui a ete lu (un `Intl` remplace). */
export function oublierFuseaux(): void { formats.clear(); memoire.clear(); lieuxConnus.clear(); }

// Les blocs d'apprentissage (etape 7) : train, val, test, et la reserve qu'on n'ouvre pas. Le tirage est fixe par une graine (le meme
// que celui de l'export, api.php::bloc_de) ; l'echantillon a verifier est tire de meme, dans chaque bloc.

import type { Bloc, MetaImage, Reglages } from './types.js';

/** Un nombre de 0 a 1 tire de la graine et de l'identifiant : toujours le meme pour la meme paire. */
export async function tirage(graine: string, id: string, sel = ''): Promise<number> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(graine + ':' + id + sel)));
  // Les quatre premiers octets, gros-boutistes : comme hexdec(substr(sha256, 0, 8)) cote serveur.
  const n = ((h[0] as number) * 2 ** 24) + ((h[1] as number) << 16) + ((h[2] as number) << 8) + (h[3] as number);
  return n / 0xffffffff;
}

/** Le bloc qu'une image recoit du tirage (celui de l'export quand elle n'en a pas). */
export async function blocTire(r: Reglages, id: string): Promise<Exclude<Bloc, '' | 'reserve'>> {
  const u = await tirage(r.graine, id);
  let cumul = 0;
  for (const b of ['train', 'val', 'test'] as const) { cumul += r.parts[b]; if (u < cumul) return b; }
  return 'train';
}

/** Le bloc d'une image : le sien, sinon le tire. */
export async function blocDe(r: Reglages, m: Pick<MetaImage, 'id' | 'bloc'>): Promise<Exclude<Bloc, ''>> {
  return m.bloc ? m.bloc : blocTire(r, m.id);
}

/** L'image est-elle dans l'echantillon a verifier (une part `echantillonPart` de chaque bloc) ? */
export async function dansLEchantillon(r: Reglages, id: string): Promise<boolean> {
  return (await tirage(r.graine, id, ':echantillon')) < r.echantillonPart;
}

export interface BilanBloc { images: number; verifiees: number; echantillon: number; echantillonVerifie: number; objets: Record<string, number> }

/** Le bilan de chaque bloc : ses images, celles verifiees, son echantillon et ce qui en est verifie, ses objets par classe. */
export async function bilanDesBlocs(r: Reglages, images: readonly MetaImage[]): Promise<Record<Exclude<Bloc, ''>, BilanBloc>> {
  const vide = (): BilanBloc => ({ images: 0, verifiees: 0, echantillon: 0, echantillonVerifie: 0, objets: {} });
  const out = { train: vide(), val: vide(), test: vide(), reserve: vide() };
  for (const m of images) {
    if (m.statut !== 'corrigee') continue;
    const b = out[await blocDe(r, m)];
    b.images++;
    if (m.verifiee) b.verifiees++;
    if (m.echantillon) { b.echantillon++; if (m.verifiee) b.echantillonVerifie++; }
    for (const c of m.classes ?? []) b.objets[c] = (b.objets[c] ?? 0) + 1;
  }
  return out;
}

/** Les parts sont-elles valables : chacune de 0 a 1, val et test non nulles, leur somme 1 a 1 % pres ? */
export function partsValables(p: Reglages['parts']): boolean {
  const s = p.train + p.val + p.test;
  return [p.train, p.val, p.test].every((x) => x >= 0 && x <= 1) && p.val > 0 && p.test > 0 && Math.abs(s - 1) < 0.01;
}

type BlocAppris = 'train' | 'val' | 'test';
const BLOCS: BlocAppris[] = ['train', 'val', 'test'];

/**
 * La repartition stratifiee (Sechidis et al., 2011, « iterative stratification ») : chaque nom YOLO se retrouve dans train, val et
 * test selon les parts voulues, meme un type rare (un oeil-de-boeuf sur cent photos). Les photos qui ont deja un bloc (fige, ou pose a
 * la main) restent et comptent ; les autres se rangent une a une, le nom le plus rare d'abord, dans le bloc qui en manque le plus. Le
 * meme resultat a chaque fois (l'ordre des photos d'egal rang suit la graine). Rend le bloc de chaque photo sans bloc.
 */
export async function repartirStratifie(r: Reglages, images: readonly Pick<MetaImage, 'id' | 'bloc' | 'etiquettes'>[]): Promise<Map<string, BlocAppris>> {
  const noms = (m: Pick<MetaImage, 'etiquettes'>) => Object.keys(m.etiquettes ?? {});
  const comptees = images.filter((m) => m.bloc !== 'reserve');
  const libres = comptees.filter((m) => !m.bloc);
  // Ce que chaque bloc doit encore recevoir : en photos, et en photos de chaque nom.
  const manque = Object.fromEntries(BLOCS.map((b) => [b, { images: r.parts[b] * comptees.length, noms: new Map<string, number>() }])) as Record<BlocAppris, { images: number; noms: Map<string, number> }>;
  const total = new Map<string, number>();
  for (const m of comptees) for (const n of noms(m)) total.set(n, (total.get(n) ?? 0) + 1);
  for (const b of BLOCS) for (const [n, t] of total) manque[b].noms.set(n, r.parts[b] * t);
  const retirer = (b: BlocAppris, m: Pick<MetaImage, 'etiquettes'>) => { manque[b].images--; for (const n of noms(m)) manque[b].noms.set(n, (manque[b].noms.get(n) ?? 0) - 1); };
  for (const m of comptees) if (m.bloc) retirer(m.bloc as BlocAppris, m);

  const rang = new Map(await Promise.all(libres.map(async (m) => [m.id, await tirage(r.graine, m.id, ':strate')] as const)));
  let reste = [...libres].sort((a, b) => (rang.get(a.id) ?? 0) - (rang.get(b.id) ?? 0));
  const out = new Map<string, BlocAppris>();
  const ranger = (m: (typeof reste)[number], nom: string | null) => {
    const score = (b: BlocAppris): [number, number] => [nom ? manque[b].noms.get(nom) ?? 0 : 0, manque[b].images];
    const b = [...BLOCS].sort((x, y) => { const [a1, a2] = score(x), [b1, b2] = score(y); return b1 - a1 || b2 - a2; })[0] as BlocAppris;
    out.set(m.id, b);
    retirer(b, m);
  };
  while (reste.length) {
    // Le nom le plus rare parmi les photos qui restent.
    const compte = new Map<string, number>();
    for (const m of reste) for (const n of noms(m)) compte.set(n, (compte.get(n) ?? 0) + 1);
    const rare = [...compte].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
    const lot = rare ? reste.filter((m) => noms(m).includes(rare)) : reste;
    for (const m of lot) ranger(m, rare);
    reste = reste.filter((m) => !out.has(m.id));
  }
  return out;
}

/** Ce qu'un bloc a de chaque nom YOLO : photos et objets. */
export interface CompteNom { photos: number; objets: number }

/** Par nom YOLO et par bloc, les photos et les objets ; d'apres le bloc de chaque photo (le sien, sinon le tirage). */
export async function comptesParNom(r: Reglages, images: readonly MetaImage[]): Promise<Map<string, Record<BlocAppris, CompteNom>>> {
  const out = new Map<string, Record<BlocAppris, CompteNom>>();
  for (const m of images) {
    if (m.statut !== 'corrigee') continue;
    const b = await blocDe(r, m);
    if (b === 'reserve') continue;
    for (const [n, k] of Object.entries(m.etiquettes ?? {})) {
      const c = out.get(n) ?? { train: { photos: 0, objets: 0 }, val: { photos: 0, objets: 0 }, test: { photos: 0, objets: 0 } };
      c[b].photos++;
      c[b].objets += k;
      out.set(n, c);
    }
  }
  return out;
}

/** Sous ce nombre d'objets en train, un nom s'apprend mal (le guide d'Ultralytics vise 1 500 ; un affinage demarre a une trentaine). */
export const OBJETS_TRAIN_MIN = 30;

/** Ce qui manque a un nom pour l'apprentissage : des objets en train, au moins un en val et en test. Vide : pret. */
export function manquesDuNom(c: Record<BlocAppris, CompteNom> | undefined): string[] {
  if (!c) return ['aucun objet marqué'];
  const m: string[] = [];
  if (c.train.objets < OBJETS_TRAIN_MIN) m.push(`${c.train.objets} en train (viser ${OBJETS_TRAIN_MIN} au moins)`);
  if (!c.val.objets) m.push('aucun en val');
  if (!c.test.objets) m.push('aucun en test');
  return m;
}

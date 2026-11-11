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

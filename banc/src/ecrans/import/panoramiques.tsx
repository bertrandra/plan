// Ce que la liste, la fenetre des vues et l'apercu de la carte partagent d'un panoramique 360 : sa version reduite lue une fois et gardee
// un moment, et la vue plate qu'on en tire, telle qu'elle sera importee.

import { useEffect, useState } from 'react';
import { lireImage } from '../../api.js';
import { Recents } from '../../cache.js';
import { bitmap, liberer, pixels, reduire, versCanevas } from '../../images.js';
import { tirerLaVue, type CadreDeVue } from '../../cadrage.js';
import type { PhotoRue, VueAExtraire } from '../../panoramax.js';

export type Pano = ReturnType<typeof pixels>;

export const NOM_VUE: Record<VueAExtraire['vue'], string> = { gauche: 'À gauche', droite: 'À droite', adresse: 'Vers la parcelle', photo: 'Photo', choisie: 'Choisie' };

/**
 * Les derniers panoramiques reduits lus (2048 px, 8 Mo de pixels chacun) : revenir sur un point deja survole ne relit rien. Quatre au
 * plus : au-dela, le plus ancien est rendu (Safari plafonne la memoire d'une page).
 */
const PANOS = new Recents<Pano>(4);

/** Le panoramique reduit d'une photo, s'il est encore en memoire (l'apercu vient de le lire). */
export const panoGarde = (id: string): Pano | undefined => PANOS.lire(id);

async function lirePano(url: string, signal: AbortSignal): Promise<Pano> {
  // En CORS, sans le cache : une copie gardee sans en-tete CORS (celle d'une balise img) ferait echouer la lecture des pixels.
  const b = await bitmap(await lireImage(url, { mode: 'cors', cache: 'no-cache', signal }));
  const c = reduire(b, 2048);
  try { return pixels(c); } finally { liberer(c); b.close(); }
}

const RIEN = { id: null as string | null, pano: null as Pano | null, erreur: null as string | null };

/**
 * Le panoramique reduit d'une photo. `delai` : le temps d'attente avant de le telecharger (au survol de la carte, on ne lit pas les
 * photos sur lesquelles la souris ne fait que passer) ; quitter la photo avant la fin annule la lecture en cours.
 */
export function usePano(p: PhotoRue | null, delai = 0): { pano: Pano | null; erreur: string | null; attente: boolean } {
  const id = p?.panoramique ? p.id : null, url = p?.panoramique ? (p.sd ?? p.hd) : null;
  const [etat, setEtat] = useState(RIEN);
  useEffect(() => {
    if (!id || !url) { setEtat(RIEN); return; }
    const garde = PANOS.lire(id);
    if (garde) { setEtat({ id, pano: garde, erreur: null }); return; }
    setEtat({ id, pano: null, erreur: null });
    const arret = new AbortController();
    const t = setTimeout(() => {
      lirePano(url, arret.signal).then((pano) => {
        PANOS.garder(id, pano);
        if (!arret.signal.aborted) setEtat({ id, pano, erreur: null });
      }).catch((e: Error) => { if (!arret.signal.aborted) setEtat({ id, pano: null, erreur: e.message }); });
    }, delai);
    return () => { clearTimeout(t); arret.abort(); };
  }, [id, url, delai]);
  const a = etat.id === id ? etat : RIEN;
  return { pano: a.pano, erreur: a.erreur, attente: !!id && !a.pano && !a.erreur };
}

/** Une vue telle qu'elle sera importee (a son cadre : cadrage.ts), calculee sur la version reduite du panoramique. */
export function Apercu({ pano, azimut, cap, cadre, largeur = 320 }: { pano: Pano | null; azimut: number; cap: number; cadre?: CadreDeVue | undefined; largeur?: number }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!pano) { setUrl(null); return; }
    const c = versCanevas(tirerLaVue(pano, azimut, cap, cadre, largeur, Math.round(largeur * 0.75)));
    setUrl(c.toDataURL('image/jpeg', 0.8));
    liberer(c);
  }, [pano, azimut, cap, cadre, largeur]);
  return url ? <img src={url} alt={`Vue à ${Math.round(cap)}°`} /> : <div className="sans-image" />;
}

/** Le cadre d'une vue, dit en peu de mots sous son image : « face au mur », ou son champ et son tangage. */
export const texteDuCadre = (c: CadreDeVue): string => (c.plan ? 'face au mur' : `${c.champ}° · ↑${c.tangage}°`) + (c.source === 'facade' && c.entier === false ? ' · coupée' : '');
export function titreDuCadre(c: CadreDeVue): string {
  if (c.plan) return 'Vue rendue face au mur visé : l’axe perpendiculaire au mur, verticales droites. Floue quand le mur est vu de près ou de biais.';
  if (c.source === 'defaut') return 'Le cadre d’avant (75° de champ, 8° vers le haut) : la hauteur du bâtiment n’est pas connue, ou le cadrage sur la façade est décoché.';
  if (c.source === 'main') return 'Cadre retouché à la main dans « Choisir les vues ».';
  return c.entier === false ? 'Champ et tangage calculés pour la façade ; elle ne tient pas en entier dans les bornes (100° de champ, 35° vers le haut) : le haut est gardé.' : 'Champ et tangage calculés pour que la façade entre dans le cadre, du pied au faîte (hauteur de la BD TOPO).';
}

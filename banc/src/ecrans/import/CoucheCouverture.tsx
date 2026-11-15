// La couverture de Panoramax sur la carte de l'import (demande du proprietaire, 15 novembre 2026 : « je veux savoir s'il y a des Panoramax
// dispo dans la zone selectionnee, sinon je zoome pour arriver a rien ») : de loin la grille de densite, puis les traces des rues
// photographiees, en orange, entre le fond et les parcelles. Les tuiles de la vue seulement, gardees un moment, abandonnees quand on
// bouge. La geometrie et les regles sont dans couverture.ts ; ici, la lecture et le dessin.

import { useEffect, useRef, useState, type RefObject } from 'react';
import { Recents } from '../../cache.js';
import { tuiles, type Taille, type VueCarte } from '../../carte.js';
import { couvertureVisible, lireCouverture, niveauCouverture, opaciteDeCase, TUILE_VIDE, urlCouverture, type EtatCouverture, type TuileCouverture } from '../../couverture.js';

const ORANGE = '#e8590c';
/** Le cote du dessin d'une tuile, en pixels : elle se montre entre 256 et 512 pixels de l'ecran (la grille jusqu'a 1000, sans dommage). */
const COTE_DESSIN = 512;
/** Au niveau le plus fin, la tuile s'etire jusqu'a la facade : ses traces se redessinent en traits a chaque image, ils sont peu nombreux. */
const NIVEAU_EN_TRAITS = 14;
/** Une tuile refusee ne se redemande pas avant ce delai. */
const DELAI_PANNE_MS = 20000;

interface Prete { t: TuileCouverture; dessin: HTMLCanvasElement | null }

/** Les dernieres tuiles lues (un dessin de 1 Mo chacune) : revenir sur ses pas ne relit rien. */
const TUILES = new Recents<Prete>(30, (p) => { if (p.dessin) p.dessin.width = p.dessin.height = 0; });

/** Le dessin d'une tuile, fait une fois : les tuiles des niveaux moyens portent des centaines de milliers de points. */
function dessiner(t: TuileCouverture, couche: 'grille' | 'traces'): HTMLCanvasElement | null {
  if (!t.lignes.length && !t.cellules.length) return null;
  const c = document.createElement('canvas');
  c.width = c.height = COTE_DESSIN;
  const x = c.getContext('2d');
  if (!x) return null;
  const k = COTE_DESSIN / t.etendue;
  x.scale(k, k);
  if (couche === 'grille') {
    x.fillStyle = ORANGE;
    // Le point d'une case est son coin (la premiere colonne est a 0) ; les rangees s'ecartent avec la latitude : chacune va jusqu'a la
    // suivante, sans jour ni recouvrement.
    const ys = [...new Set(t.cellules.map((q) => q.y))].sort((a, b) => a - b), haut = new Map(ys.map((y, i) => [y, i + 1 < ys.length ? (ys[i + 1] as number) - y : y - (ys[i - 1] ?? y - t.pas.y)]));
    for (const q of t.cellules) { x.globalAlpha = opaciteDeCase(q.n); x.fillRect(q.x, q.y, t.pas.x + 0.5, Math.min(2 * t.pas.y, haut.get(q.y) ?? t.pas.y)); }
    return c;
  }
  tracer(x, t, 1.6 / k);
  return c;
}

/** Tous les traces d'une tuile d'un seul trait : la ou deux sequences se superposent, la teinte ne s'epaissit pas. */
function tracer(x: CanvasRenderingContext2D, t: TuileCouverture, epaisseur: number): void {
  x.strokeStyle = ORANGE; x.lineWidth = epaisseur; x.lineJoin = 'round'; x.lineCap = 'round';
  x.beginPath();
  for (const l of t.lignes) {
    x.moveTo(l[0] as number, l[1] as number);
    // Une sequence d'une seule photo : un point.
    if (l.length === 2) x.lineTo(l[0] as number, l[1] as number);
    for (let i = 2; i < l.length; i += 2) x.lineTo(l[i] as number, l[i + 1] as number);
  }
  x.stroke();
}

async function lire(cle: string, couche: 'grille' | 'traces', url: string, signal: AbortSignal): Promise<void> {
  const r = await fetch(url, { signal });
  // Une tuile sans aucune photo est un 204 : on le sait, ce n'est pas une panne.
  if (r.status === 204) { TUILES.garder(cle, { t: TUILE_VIDE, dessin: null }); return; }
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const t = lireCouverture(new Uint8Array(await r.arrayBuffer()), couche);
  const niveau = Number(cle.split('/')[1]);
  TUILES.garder(cle, { t, dessin: couche === 'traces' && niveau >= NIVEAU_EN_TRAITS ? null : dessiner(t, couche) });
}

/**
 * La couverture de la vue : `toile` est le canevas ou elle se dessine, `etat` ce qu'on en sait (de quoi dire ou zoomer, ou qu'il n'y a
 * rien). `enVol` : pendant un vol la carte traverse des niveaux, on ne lit rien.
 */
export function useCouverture(vue: VueCarte, taille: Taille, actif: boolean, enVol: boolean): { toile: RefObject<HTMLCanvasElement | null>; etat: EtatCouverture; couche: 'grille' | 'traces' } {
  const toile = useRef<HTMLCanvasElement | null>(null);
  const [, setVersion] = useState(0);
  const enCours = useRef(new Map<string, AbortController>());
  const pannes = useRef(new Map<string, number>());
  const { couche, niveau } = niveauCouverture(vue.zoom);
  const placees = actif && taille.l > 0 ? tuiles(vue, taille, niveau).map((t) => ({ ...t, cle: `${couche}/${t.z}/${t.x}/${t.y}` })) : [];
  const cles = placees.map((t) => t.cle).join(' ');

  useEffect(() => {
    const voulues = new Set(cles ? cles.split(' ') : []);
    for (const [k, a] of enCours.current) if (!voulues.has(k)) { a.abort(); enCours.current.delete(k); }
    if (enVol || !voulues.size) return;
    // Un court repos : glisser la carte ne demande pas les tuiles de chaque image.
    const attente = setTimeout(() => {
      for (const cle of voulues) {
        if (TUILES.lire(cle) || enCours.current.has(cle) || Date.now() - (pannes.current.get(cle) ?? -Infinity) < DELAI_PANNE_MS) continue;
        const arret = new AbortController(), [c, z, x, y] = cle.split('/');
        enCours.current.set(cle, arret);
        lire(cle, c as 'grille' | 'traces', urlCouverture(Number(z), Number(x), Number(y)), arret.signal)
          .then(() => pannes.current.delete(cle), () => { if (!arret.signal.aborted) pannes.current.set(cle, Date.now()); })
          .finally(() => { if (enCours.current.get(cle) === arret) enCours.current.delete(cle); if (!arret.signal.aborted) setVersion((v) => v + 1); });
      }
    }, 200);
    return () => clearTimeout(attente);
  }, [cles, enVol]);
  useEffect(() => { const e = enCours.current; return () => { for (const a of e.values()) a.abort(); e.clear(); }; }, []);

  // Le dessin suit la vue a chaque image : des tuiles deja dessinees, posees a leur place.
  useEffect(() => {
    const c = toile.current, x = c?.getContext('2d');
    if (!c || !x) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), l = Math.round(taille.l * dpr), h = Math.round(taille.h * dpr);
    if (c.width !== l || c.height !== h) { c.width = l; c.height = h; }
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, taille.l, taille.h);
    for (const p of placees) {
      const prete = TUILES.lire(p.cle);
      if (!prete) continue;
      if (prete.dessin) { x.drawImage(prete.dessin, p.gauche, p.haut, p.cote, p.cote); continue; }
      if (!prete.t.lignes.length) continue;
      // En traits, dans le carre de la tuile seulement : sa marge deborde sur les voisines, qui la dessinent aussi.
      const k = p.cote / prete.t.etendue;
      x.save();
      x.beginPath(); x.rect(p.gauche, p.haut, p.cote, p.cote); x.clip();
      x.translate(p.gauche, p.haut); x.scale(k, k);
      tracer(x, prete.t, 2.5 / k);
      x.restore();
    }
  });

  // De la couverture deja vue suffit a dire oui ; une tuile manquante laisse la question ouverte, meme si les autres sont vides.
  let vue_ = false, manque = !placees.length, panne = false;
  for (const p of placees) {
    const prete = TUILES.lire(p.cle);
    if (prete) vue_ ||= couvertureVisible(p, prete.t.occupation, taille);
    else if (pannes.current.has(p.cle) && !enCours.current.has(p.cle)) panne = true;
    else manque = true;
  }
  const etat: EtatCouverture = !actif ? 'eteinte' : vue_ ? 'oui' : panne ? 'panne' : manque ? 'attente' : 'non';
  return { toile, etat, couche };
}

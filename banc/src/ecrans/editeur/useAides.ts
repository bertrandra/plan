// Les aides au trace de l'editeur (demande du proprietaire, 13 novembre 2026 : la productivite de l'annotation) : « Trouver les semblables »
// (F), « Coller au bord » (C) et l'aimant (M), qui cale un rectangle des qu'il est trace. Toutes lisent la photo en gris, chargee une fois
// par photo a la taille de travail ; le calcul est dans semblables.ts et bords.ts (purs, testes).

import { useEffect, useRef, useState } from 'react';
import { bitmap, COTE_TRAVAIL, liberer, pixels, reduire } from '../../images.js';
import { gris, type Gris } from '../../fusionAlignement.js';
import { vuDe } from '../../fusion.js';
import { semblables, type Boite } from '../../semblables.js';
import { caler } from '../../bords.js';
import { rangerLesParents } from '../../geometrie.js';
import type { Classe, Objet, P } from '../../types.js';
import type { Image } from '../../plan/facade/vision/homographie.js';

/** La photo en gris (et en couleurs, a la meme taille), et le facteur des pixels de la photo vers ceux du gris. */
function useGris(url: string, L: number): { g: Gris; f: number; img: Image } | null {
  const [etat, setEtat] = useState<{ url: string; g: Gris; f: number; img: Image } | null>(null);
  useEffect(() => {
    let fini = false;
    void (async () => {
      const b = await bitmap(url);
      const c = reduire(b, COTE_TRAVAIL);
      try {
        const img = pixels(c);
        if (!fini) setEtat({ url, g: gris(img, vuDe(img), 1), f: c.width / Math.max(1, L), img });
      } finally { liberer(c); b.close(); }
    })().catch(() => { /* sans l'image, les aides ne font rien */ });
    return () => { fini = true; };
  }, [url, L]);
  return etat && etat.url === url ? etat : null;
}

const boiteDe = (o: Objet): Boite => ({ x0: Math.min(...o.points.map((p) => p.x)), y0: Math.min(...o.points.map((p) => p.y)), x1: Math.max(...o.points.map((p) => p.x)), y1: Math.max(...o.points.map((p) => p.y)) });
const enPhoto = (b: Boite, f: number): P[] => [{ x: Math.round((b.x0 / f) * 10) / 10, y: Math.round((b.y0 / f) * 10) / 10 }, { x: Math.round((b.x1 / f) * 10) / 10, y: Math.round((b.y1 / f) * 10) / 10 }];
const enGris = (b: Boite, f: number): Boite => ({ x0: b.x0 * f, y0: b.y0 * f, x1: b.x1 * f, y1: b.y1 * f });

export function useAides({ url, L, classes, dire }: { url: string; L: number; classes: readonly Classe[]; dire: (t: string, genre?: 'ok' | 'erreur') => void }) {
  const image = useGris(url, L);
  const [aimant, setAimant] = useState(true);
  const enCours = useRef(false);

  /** Un rectangle cale sur les bords (pixels de la photo) ; tel quel sans l'image. */
  const calerPoints = (pts: readonly P[]): P[] => {
    if (!image || pts.length < 2) return [...pts];
    return enPhoto(caler(image.g, enGris(boiteDe({ points: [...pts] } as Objet), image.f)), image.f);
  };

  /** « Coller au bord » sur les rectangles choisis ; un objet du brouillon touche devient corrige. */
  const calerObjets = (objets: readonly Objet[], ids: ReadonlySet<string>): Objet[] => objets.map((o) => {
    if (!ids.has(o.id) || o.forme !== 'rectangle') return o;
    const points = calerPoints(o.points);
    return points.some((p, i) => p.x !== o.points[i]?.x || p.y !== o.points[i]?.y) ? { ...o, points, origine: o.origine === 'auto' ? 'corrige' : o.origine } : o;
  });

  /**
   * Les semblables de l'objet `modele` (un rectangle) : de nouveaux objets du brouillon (origine « auto », a relire par Tab et A), de sa
   * classe et de son type, cales sur leurs bords. Les places deja prises par un objet de la meme classe ne sont pas proposees.
   */
  const trouver = (objets: readonly Objet[], modele: Objet): Objet[] | null => {
    if (!image || enCours.current) { if (!image) dire('La photo se charge encore : réessayez dans un instant.'); return null; }
    if (modele.forme !== 'rectangle') { dire('Les semblables se cherchent d’un rectangle.', 'erreur'); return null; }
    enCours.current = true;
    try {
      const prises = objets.filter((o) => o.classe === modele.classe && o.forme === 'rectangle').map((o) => enGris(boiteDe(o), image.f));
      const trouves = semblables(image.g, enGris(boiteDe(modele), image.f), prises, 0.65, 40, image.img);
      const ids = new Set(objets.map((o) => o.id));
      let k = 1;
      const nouveaux: Objet[] = trouves.map((t) => {
        while (ids.has('s' + k)) k++;
        ids.add('s' + k);
        return { id: 's' + k, classe: modele.classe, ...(modele.type ? { type: modele.type } : {}), forme: 'rectangle', points: enPhoto(caler(image.g, t.boite), image.f),
          parent: null, attributs: { ...modele.attributs }, origine: 'auto', score: Math.round(t.score * 1000) / 1000, modele: 'semblables' };
      });
      return nouveaux.length ? rangerLesParents([...objets, ...nouveaux], [...classes]) : [];
    } finally { enCours.current = false; }
  };
  return { pret: !!image, aimant, basculerAimant: () => setAimant((x) => !x), calerPoints, calerObjets, trouver };
}

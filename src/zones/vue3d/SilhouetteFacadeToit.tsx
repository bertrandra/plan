// Z4, le profil de la facade choisie dans le mode Toit : son haut, du sol a l'egout et au faitage, tel que le donnent tous les corps du toit,
// dessine a l'echelle et pose sur la facade, avec ses trois cotes en metres (largeur, egout, faitage).
//
// Un calque SVG par-dessus la scene, comme les poignees : chaque point est un point 3D du plan de la facade que la camera projette, donc le
// trait suit la facade a l'ecran et se lit en vraie grandeur. Le profil est le gabarit du mur (facade/gabaritMur.ts), pas la silhouette d'un
// seul corps (PoigneesToit.tsx) : il montre ce que la facade montre vue de dehors.

import { useEffect, useRef } from 'react';
import { altitudeDuBatiment, etatToit, sessionToit } from '../../app/toits/modeToit.js';
import { profilDeLaFacade } from '../../facade/regles/toits/profilDeFacade.js';
import { abonnerSceneBatie, vue3d } from '../../three/etat3d.js';
import { corpsDuToitSimple } from '../../three/gestesToits.js';
import { projeter, type Ecran } from './PoigneesToit.js';
import type { Magasin } from '../../app/magasin.js';

/** Le profil se pose juste devant le mur (5 cm) : jamais enfoui dans la maconnerie. */
const DEVANT_M = 0.05;
/** Les cotes se tracent a cette distance du profil, en metres. */
const ECART_COTE_M = 0.45;
/** Deux hauteurs qui different de moins que cela n'en font qu'une : un seul chiffre, « hauteur ». */
const ECART_UTILE_M = 0.15;

/** Une cote se lit a 5 cm : le gabarit se lit a 2 cm dans le corps, un egout de 4 m y vaut 4,02 m. */
const fr = (v: number) => (Math.round(v * 20) / 20).toFixed(2).replace('.', ',') + ' m';

/** Ce que le calque dessine : tout est calcule hors du rendu, a chaque pas de camera, pour qu'un rendu force ne change pas l'affichage. */
interface Dessin {
  largeur: number;
  hauteur: number;
  formes: string[];
  cotes: { a: Ecran; b: Ecran; texte: string; vertical: boolean }[];
}

/** Le profil de la facade courante projete a l'ecran, ou null (pas de facade, pas de corps, ou un point derriere la camera). */
function dessiner(magasin: Magasin): Dessin | null {
  const s = sessionToit(), e = etatToit(), sc = vue3d.scene;
  if (!s || !e.actif || !e.silhouette || e.vue !== 'facade' || !s.facade || !sc) return null;
  const o = magasin.store.getState().etat.objects.find((x) => x.key === s.cle);
  // Un batiment dont le toit n'est pas encore decoupe en corps (un rectangle sous un toit simple) a son corps unique : celui que le premier geste poserait.
  const corps = o?.batiment?.corpsToit?.length ? o.batiment.corpsToit : o ? corpsDuToitSimple(o) : [];
  if (!corps.length) return null;
  const base = altitudeDuBatiment(o), f = s.facade;
  // Vu de dehors : l'angle qui est a gauche a l'ecran est la « gauche » du mur.
  const pa = projeter({ x: f.a.x, y: f.a.y, z: 0 }, base), pb = projeter({ x: f.b.x, y: f.b.y, z: 0 }, base);
  if (!pa || !pb) return null;
  const [gauche, droite] = pa.x <= pb.x ? [f.a, f.b] : [f.b, f.a];
  const profil = profilDeLaFacade({ gauche, droite, normale: f.n, largeur: f.L }, corps);
  if (!profil) return null;
  const sur = (x: number, z: number): Ecran | null => {
    const t = x / f.L;
    return projeter({ x: gauche.x + (droite.x - gauche.x) * t + f.n.x * DEVANT_M, y: gauche.y + (droite.y - gauche.y) * t + f.n.y * DEVANT_M, z }, base);
  };
  const formes = profil.troncons.flatMap((t) => {
    const pts = [sur(t[0]?.x ?? 0, 0), ...t.map((p) => sur(p.x, p.y)), sur(t[t.length - 1]?.x ?? 0, 0)];
    return pts.every((q): q is Ecran => q !== null) ? [pts.map((q) => Math.round(q.x * 10) / 10 + ',' + Math.round(q.y * 10) / 10).join(' ')] : [];
  });
  // Les cotes : la largeur sous le sol, le faitage a droite, l'egout a gauche (une seule hauteur si le haut est de niveau).
  const x0 = profil.troncons[0]?.[0]?.x ?? 0, egout = profil.hauteurMax - profil.hauteurMin > ECART_UTILE_M;
  const cotes: Dessin['cotes'] = [];
  const poser = (a: Ecran | null, b: Ecran | null, texte: string, vertical: boolean) => { if (a && b) cotes.push({ a, b, texte, vertical }); };
  poser(sur(x0, -ECART_COTE_M), sur(profil.largeur, -ECART_COTE_M), fr(profil.largeur), false);
  poser(sur(profil.largeur + ECART_COTE_M, 0), sur(profil.largeur + ECART_COTE_M, profil.hauteurMax), (egout ? 'faîtage ' : '') + fr(profil.hauteurMax), true);
  if (egout) poser(sur(-ECART_COTE_M, 0), sur(-ECART_COTE_M, profil.hauteurMin), 'égout ' + fr(profil.hauteurMin), true);
  const r = sc.renderer.domElement.getBoundingClientRect();
  return { largeur: r.width, hauteur: r.height, formes, cotes };
}

const arrondi = (v: number) => Math.round(v * 10) / 10;

/** Le dessin en SVG : le profil en tirets et ses cotes (le texte n'a que des chiffres et des mots fixes, rien a echapper). */
function enSvg(d: Dessin): string {
  const cote = (c: Dessin['cotes'][number]) =>
    `<g class="coteFacadeToit" data-cote="${c.vertical ? 'hauteur' : 'largeur'}"><line x1="${arrondi(c.a.x)}" y1="${arrondi(c.a.y)}" x2="${arrondi(c.b.x)}" y2="${arrondi(c.b.y)}"/>` +
    `<text x="${arrondi((c.a.x + c.b.x) / 2)}" y="${arrondi((c.a.y + c.b.y) / 2)}" text-anchor="middle" dominant-baseline="central">${c.texte}</text></g>`;
  return d.formes.map((p) => `<polygon class="profilFacadeToit" points="${p}"/>`).join('') + d.cotes.map(cote).join('');
}

/**
 * Le calque est tenu a la main, pas par React : sa position suit la camera (qui bouge sans que le plan change), et un rendu force
 * de la zone (le garde-fou des cles de version) le verrait differer a chaque pas de l'animation. Le noeud est stable, son contenu
 * est ecrit a chaque pas de camera et quand la scene vient d'etre rebatie.
 */
export function SilhouetteFacadeToit({ magasin }: { magasin: Magasin }) {
  const svg = useRef<SVGSVGElement | null>(null);
  useEffect(() => {
    let derniere = '';
    const ecrire = () => {
      const n = svg.current;
      if (!n) return;
      const d = dessiner(magasin);
      const contenu = d ? enSvg(d) : '';
      if (contenu === derniere) return;
      derniere = contenu;
      if (d) { n.setAttribute('width', String(d.largeur)); n.setAttribute('height', String(d.hauteur)); n.setAttribute('viewBox', '0 0 ' + d.largeur + ' ' + d.hauteur); }
      n.innerHTML = contenu;
    };
    ecrire();
    const id = setInterval(ecrire, 100);
    const desabonner = abonnerSceneBatie(ecrire);
    return () => { clearInterval(id); desabonner(); };
  }, [magasin]);
  return <svg ref={svg} className="silhouetteFacadeToit" aria-label="Profil de la façade, à l’échelle" />;
}

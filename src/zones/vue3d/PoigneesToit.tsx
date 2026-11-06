// Z4, les poignees du mode Toit (MD/spec-mode-toit-3d.md, etape 4) : ce qu'on attrape sur la scene pour deplacer, etirer ou monter l'element choisi.
//
// Un calque SVG par-dessus la scene : chaque poignee est un point 3D que la camera projette a l'ecran (facade/modeToit/poignees.ts les
// nomme). Glisser une poignee demande a l'ecran ce que vaut un metre sur chacun de ses axes, a cet endroit, et convertit le deplacement du
// doigt en metres ; la geometrie (aimantation comprise) est celle de `glisser`, toujours rejouee a partir du corps de depart. Un glisser
// reconstruit la scene a un rythme borne, et la session n'empile qu'UNE etape a la fin. Echap l'annule.
//
// Une bulle donne les cotes de l'element, des guides en pointille disent contre quel bord il s'est colle.

import { useEffect, useRef, useState } from 'react';
import { altitudeDuBatiment, etatToit, modeToitCourant, sessionToit } from '../../app/toits/modeToit.js';
import { useCle, CLE_GELEE } from '../composants/abonnement.js';
import { axeUtilisable, cadreDe, cibleDesPoignees, cotesDe, ecarterAEcran, glisser, poigneesDe, type Axe, type Oeil, type CadreFacade, type CibleGlisser, type Cote, type Deplacement, type Point3, type Poignee } from '../../facade/modeToit/poignees.js';
import { abonnerImage, cameraDeVue, hotes3d, vue3d } from '../../three/etat3d.js';
import { estCache } from '../../three/occultation.js';
import { moteur3d } from '../../three/demande3d.js';
import { ramenerDansLeLibre } from '../../facade/modeToit/poigneesLibres.js';
import type { Magasin } from '../../app/magasin.js';
import type { CorpsToit } from '../../model/types.js';
import type { PtBrut } from '../../model/types.js';
import { silhouetteVersLOeil } from '../../facade/regles/toits/silhouetteDesCorps.js';

/** Le rayon visible d'une poignee, et celui de sa zone de saisie (44 px de diametre au moins, pour le doigt). */
const RAYON_PX = 9, SAISIE_PX = 22;
/**
 * Les poignees qui deplacent l'element choisi (le corps entier, ou l'element le long de son mur) : un carre plus grand, plein, a
 * quatre fleches, distinct des poignees rondes qui etirent ou montent.
 */
const DEPLACEMENTS = new Set(['deplacer', 'pos']);
const RAYON_DEPLACER_PX = 12;
/** Les quatre fleches du deplacement, centrees sur la poignee. */
const FLECHES = 'M0 -8 L3 -4.5 H1 V-1 H4.5 V-3 L8 0 L4.5 3 V1 H1 V4.5 H3 L0 8 L-3 4.5 H-1 V1 H-4.5 V3 L-8 0 L-4.5 -3 V-1 H-1 V-4.5 H-3 Z';

/**
 * L'oeil, la camera qui fait l'image : un point du plan, et sa hauteur au-dessus du sol du batiment (`base`, `altitudeDuBatiment`). C'est
 * lui que regarde le mur le plus visible du corps choisi, sa silhouette et ses poignees (facade/modeToit/poignees.ts::murLePlusVisible).
 */
function oeilDeLaVue(base: number): Oeil | null {
  const sc = vue3d.scene;
  if (!sc) return null;
  const cam = cameraDeVue(sc).position;
  return { x: cam.x + sc.cen.x, y: sc.cen.y - cam.z, z: cam.y - base };
}

/**
 * La silhouette d'un corps a l'ecran : son mur `mur`, du pied au haut sous son toit (pignon compris), projete dans le calque. Null sans
 * scene, ou quand un point tombe derriere la camera.
 */
function silhouetteAEcran(c: CorpsToit | undefined, base: number, oeil: PtBrut, mur: number): Ecran[] | null {
  if (!c || !vue3d.scene) return null;
  const pts = silhouetteVersLOeil(c, oeil, mur)?.map((q) => projeter(q, base));
  return pts?.every((q): q is Ecran => q !== null) ? pts : null;
}

/** Le trait de la silhouette du corps choisi : un halo clair sous un trait epais, lisible sur la photo comme sur le crepi. */
function TraitCorps({ pts }: { pts: readonly Ecran[] }) {
  const d = pts.map((q) => q.x + ',' + q.y).join(' ');
  return <g className="silhouetteCorpsToit"><polygon className="halo" points={d} /><polygon className="trait" points={d} /></g>;
}

/** Au-dessous de cette longueur d'axe a l'ecran (px par metre), l'axe est vu de face : il ne se glisse pas. */
const AXE_MIN_PX = 6;
/** Les pixels d'un metre de profondeur, au moins : un pixel de doigt pour un centimetre. */
const PROFONDEUR_MIN_PX = 100;

interface Ecran { x: number; y: number }

/**
 * Projette un point de la scene (plan + hauteur) dans le calque, en pixels ; null derriere la camera ou sans scene. `base` : l'altitude d'ou se
 * comptent les hauteurs du batiment (le relief, `altitudeDuBatiment`). La camera est celle qui fait l'image : l'oblique devant une facade.
 */
function projeter(p: Point3, base: number): Ecran | null {
  const sc = vue3d.scene, hote = hotes3d.vue3d;
  if (!sc || !hote) return null;
  const v = new THREE.Vector3(p.x - sc.cen.x, base + p.z, sc.cen.y - p.y).project(cameraDeVue(sc));
  if (v.z > 1) return null;
  const r = hote.getBoundingClientRect();
  return { x: ((v.x + 1) / 2) * r.width, y: ((1 - v.y) / 2) * r.height };
}

/** La direction 3D d'un axe de la facade, unitaire. */
const direction = (f: CadreFacade, a: Axe): Point3 => (a === 'long' ? { x: f.u.x, y: f.u.y, z: 0 } : a === 'prof' ? { x: f.n.x, y: f.n.y, z: 0 } : { x: 0, y: 0, z: 1 });

/** Ce que vaut un metre sur chaque axe de la poignee, en pixels de l'ecran, la ou elle est. */
function vecteursEcran(p: Point3, axes: readonly Axe[], f: CadreFacade, base: number): Partial<Record<Axe, Ecran>> {
  const o = projeter(p, base), res: Partial<Record<Axe, Ecran>> = {};
  if (!o) return res;
  for (const a of axes) {
    const d = direction(f, a), q = projeter({ x: p.x + d.x, y: p.y + d.y, z: p.z + d.z }, base);
    // La profondeur se voit en raccourci de face : son axe a l'ecran est allonge (`axeUtilisable`), pour se regler au centimetre.
    if (q) res[a] = a === 'prof' ? axeUtilisable({ x: q.x - o.x, y: q.y - o.y }, PROFONDEUR_MIN_PX) : { x: q.x - o.x, y: q.y - o.y };
  }
  return res;
}

/** Le deplacement du doigt, en metres sur les axes de la poignee : un axe se projette, deux se resolvent ensemble (sauf s'ils se confondent a l'ecran). */
function enMetres(dx: number, dy: number, axes: readonly Axe[], v: Partial<Record<Axe, Ecran>>): Deplacement {
  const utiles = axes.filter((a) => { const e = v[a]; return !!e && Math.hypot(e.x, e.y) >= AXE_MIN_PX; });
  const res: Deplacement = {};
  if (utiles.length === 2) {
    const a = v[utiles[0] as Axe] as Ecran, b = v[utiles[1] as Axe] as Ecran, det = a.x * b.y - a.y * b.x;
    if (Math.abs(det) > 0.35 * Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y)) {
      res[utiles[0] as Axe] = (dx * b.y - dy * b.x) / det;
      res[utiles[1] as Axe] = (a.x * dy - a.y * dx) / det;
      return res;
    }
    // Les deux axes se confondent a l'ecran : le plus long a l'ecran porte le geste.
    utiles.sort((p, q) => Math.hypot((v[q] as Ecran).x, (v[q] as Ecran).y) - Math.hypot((v[p] as Ecran).x, (v[p] as Ecran).y));
    utiles.length = 1;
  }
  for (const a of utiles) { const e = v[a] as Ecran; res[a] = (dx * e.x + dy * e.y) / (e.x * e.x + e.y * e.y); }
  return res;
}

interface Glisse {
  id: string; depart: CorpsToit[]; x0: number; y0: number; cible: CibleGlisser; poignee: Poignee; vecteurs: Partial<Record<Axe, Ecran>>;
  /** Le doigt (ou la souris) qui tire, l'element qui le tient, et ou il est : un second doigt rend le geste a l orbite (`poserSurLaScene`). */
  pointeur: number; type: string; element: Element; x: number; y: number;
}

/**
 * Un pointeur rejoue sur le canevas de la scene : l'orbite (OrbitControls) le prend comme s'il s'y etait pose, et suit ensuite ses
 * mouvements sur le document. C'est ainsi qu'un pincement commence sur une poignee devient un pincement de la vue.
 */
function poserSurLaScene(pointeur: number, type: string, x: number, y: number, primaire: boolean): void {
  const toile = vue3d.scene?.renderer.domElement;
  if (!toile) return;
  toile.dispatchEvent(new PointerEvent('pointerdown', { pointerId: pointeur, pointerType: type, clientX: x, clientY: y, isPrimary: primaire, button: 0, buttons: 1, bubbles: true }));
}

/** Les poignees cachees se cherchent par un rayon de l'oeil : un seul, reutilise. */
let rayon: InstanceType<typeof THREE.Raycaster> | null = null;

/**
 * La partie de l'image ou une poignee ecartee peut aller : hors du panneau du mode (colonne a droite ou bandeau en bas) et a une cible
 * tactile des bords (le bandeau des vues, l'horloge et les boutons de la scene les bordent). En pixels du calque.
 */
function bornesLibres(hote: DOMRect): { x0: number; y0: number; x1: number; y1: number } {
  const p = hotes3d.vue3d?.querySelector('.panneauToit')?.getBoundingClientRect();
  const m = 2 * SAISIE_PX;
  let x1 = hote.width - m, y1 = hote.height - m;
  if (p && p.width > 0) { if (p.width < hote.width * 0.6) x1 = Math.min(x1, p.left - hote.left - m); else y1 = Math.min(y1, p.top - hote.top - m); }
  return { x0: m, y0: m, x1: Math.max(m, x1), y1: Math.max(m, y1) };
}

export function PoigneesToit({ magasin }: { magasin: Magasin }) {
  // Hors d'une session du toit, rien a montrer : la zone ne suit pas les rendus du plan ; en session, elle les suit tous.
  useCle(magasin, 'poignées du toit', (s) => (sessionToit() ? String(s.version) : CLE_GELEE));
  const [, redessiner] = useState(0);
  const [guides, setGuides] = useState<number[]>([]);
  const glisse = useRef<Glisse | null>(null);

  // La camera bouge, la session change : on redessine. Le calque lit la scene, il ne la possede pas. Chaque image rendue le dit
  // (`abonnerImage`) : les poignees suivent la camera de l'image meme, sans le retard d'un minuteur (audit de la camera, 6 novembre 2026).
  useEffect(() => {
    let derniere = '';
    const desabonner = abonnerImage((sc) => {
      if (!sessionToit() || sc !== vue3d.scene) return;
      // La camera qui fait l'image : celle de l'orbite, ou l'oblique de la facade (qui ne bouge qu'au recadrage).
      const cam = cameraDeVue(sc);
      const cle = [...cam.matrixWorld.elements, ...cam.projectionMatrix.elements].map((v) => v.toFixed(3)).join();
      if (cle !== derniere) { derniere = cle; redessiner((n) => n + 1); }
    });
    const echap = (e: KeyboardEvent) => { if (e.key === 'Escape' && glisse.current) { glisse.current = null; modeToitCourant()?.annulerGlisser(); setGuides([]); e.stopPropagation(); } };
    // Un second doigt pendant qu'une poignee est tiree : c'est un pincement, pas une retouche. Le glisser est annule (le toit revient a
    // l'etat de la pile) et les deux doigts vont a l'orbite ; un second doigt pose sur une autre poignee ne la prend pas.
    const second = (e: PointerEvent) => {
      const g = glisse.current;
      if (!g || e.pointerId === g.pointeur || !e.isTrusted) return;
      glisse.current = null;
      try { g.element.releasePointerCapture(g.pointeur); } catch { /* deja relache */ }
      modeToitCourant()?.annulerGlisser();
      setGuides([]);
      poserSurLaScene(g.pointeur, g.type, g.x, g.y, true);
      const t = e.target as Element | null;
      if (!(t instanceof HTMLCanvasElement)) { e.stopPropagation(); e.preventDefault(); poserSurLaScene(e.pointerId, e.pointerType, e.clientX, e.clientY, false); }
    };
    document.addEventListener('pointerdown', second, true);
    window.addEventListener('keydown', echap, true);
    return () => { desabonner(); document.removeEventListener('pointerdown', second, true); window.removeEventListener('keydown', echap, true); };
  }, []);

  const s = sessionToit(), e = etatToit();
  if (!s || !e.actif || e.validee) return null;
  const plan = e.vue === 'dessus';
  const o = magasin.store.getState().etat.objects.find((x) => x.key === s.cle);
  const corps = o?.batiment?.corpsToit;
  if (!corps?.length) return null;
  const f = s.facade ?? s.derniere;
  const oeil = oeilDeLaVue(altitudeDuBatiment(o));
  // Ce que tirent les poignees : de dessus, le corps choisi ; de face, l'element choisi devant sa facade, ou le corps choisi par le mur
  // ou se trace sa silhouette (jamais la facade d'un autre corps) ; sans choix, la facade courante (facade/modeToit/poignees.ts).
  const cible: CibleGlisser | null = oeil ? cibleDesPoignees(corps, e.selection, { dessus: plan, facade: f, oeil }) : null;
  // Le corps choisi : sa silhouette, sur le mur de ses poignees, tracee lisible (de dessus, le plan le montre deja).
  const silhouette = !plan && oeil && e.selection?.type === 'corps' && cible?.type === 'facade' ? silhouetteAEcran(corps[e.selection.rang], altitudeDuBatiment(o), oeil, cible.mur) : null;
  const seule = () => (silhouette ? <svg className="poigneesToit" data-suit-la-camera="" width="100%" height="100%" aria-hidden="true"><TraitCorps pts={silhouette} /></svg> : null);
  if (!cible) return seule();
  const cadre = cadreDe(corps, cible);
  const poignees = poigneesDe(corps, cible);
  const hote = hotes3d.vue3d;
  if (!cadre || !poignees.length || !hote) return seule();
  const r = hote.getBoundingClientRect();
  const cotes: Cote[] = cotesDe(corps, cible);
  const base = altitudeDuBatiment(o);
  const ancre = projeter(poignees[0]?.point as Point3, base);
  // Les poignees a l'ecran, ecartees si elles se recouvrent : chacune doit se prendre au doigt (deux zones de saisie bord a bord).
  const projetees = poignees.map((p) => projeter(p.point, base));
  // Une poignee sous le panneau se ramene au bord de la partie libre : elle se prend, un trait la relie a son point.
  const libres = bornesLibres(r);
  // Hors de l'image, elle reste ou elle est (on la retrouve en tournant) : seule celle que le panneau (ou un bord) couvre se ramene.
  const ramenees = projetees.map((q) => (q && q.x >= 0 && q.y >= 0 && q.x <= r.width && q.y <= r.height ? ramenerDansLeLibre(q, libres) : q));
  const ecartees = ecarterAEcran(ramenees.map((q) => q ?? { x: NaN, y: NaN }), 2 * SAISIE_PX, libres);
  const places = ramenees.map((q, k) => (q ? ecartees[k] ?? q : null));
  // Une poignee derriere une surface du batiment, en 3D libre : estompee, elle ne se prend pas. Le rayon part de l'oeil de l'orbite vers
  // son point. De dessus, les poignees sont celles du plan, posees au pied du corps sous son toit ; devant une facade, la vue est celle du mur.
  const sc = vue3d.scene, racines = sc && !sc.cameraRendu && !plan ? moteur3d()?.racinesDe3d(s.cle) ?? [] : [];
  rayon ??= racines.length ? new THREE.Raycaster() : null;
  const cachees = poignees.map((p) => !!sc && !!rayon && racines.length > 0 && estCache(sc.camera, racines, { x: p.point.x - sc.cen.x, y: base + p.point.z, z: sc.cen.y - p.point.y }, rayon));

  const demarrer = (ev: React.PointerEvent<SVGGElement>, p: Poignee) => {
    ev.stopPropagation();
    ev.preventDefault();
    (ev.currentTarget as Element).setPointerCapture(ev.pointerId);
    glisse.current = { id: p.id, depart: JSON.parse(JSON.stringify(corps)) as CorpsToit[], x0: ev.clientX, y0: ev.clientY, cible, poignee: p, vecteurs: vecteursEcran(p.point, p.axes, cadre, base),
      pointeur: ev.pointerId, type: ev.pointerType, element: ev.currentTarget as Element, x: ev.clientX, y: ev.clientY };
  };
  const bouger = (ev: React.PointerEvent<SVGGElement>) => {
    const g = glisse.current;
    if (!g || ev.pointerId !== g.pointeur) return;
    g.x = ev.clientX; g.y = ev.clientY;
    const d = enMetres(ev.clientX - g.x0, ev.clientY - g.y0, g.poignee.axes, g.vecteurs);
    const res = glisser(g.depart, g.cible, g.id, d);
    modeToitCourant()?.apercu(res.corps, res.elevation);
    setGuides(res.guides);
    redessiner((n) => n + 1);
  };
  const finir = (ev: React.PointerEvent<SVGGElement>) => {
    if (!glisse.current || ev.pointerId !== glisse.current.pointeur) return;
    glisse.current = null;
    (ev.currentTarget as Element).releasePointerCapture(ev.pointerId);
    modeToitCourant()?.finGlisser();
    setGuides([]);
  };

  return (
    <svg className="poigneesToit" data-suit-la-camera="" width={r.width} height={r.height} viewBox={'0 0 ' + r.width + ' ' + r.height} aria-label="Poignées de l’élément choisi">
      {silhouette && <TraitCorps pts={silhouette} />}
      {guides.map((g) => {
        const a = projeter({ x: cadre.o.x + cadre.u.x * g, y: cadre.o.y + cadre.u.y * g, z: 0 }, base), b = projeter({ x: cadre.o.x + cadre.u.x * g, y: cadre.o.y + cadre.u.y * g, z: (corps[0]?.faitage ?? 5) + 0.5 }, base);
        return a && b ? <line key={g} className="guideToit" x1={a.x} y1={a.y} x2={b.x} y2={b.y} /> : null;
      })}
      {poignees.map((p, k) => {
        const q = places[k], vrai = projetees[k];
        if (!q) return null;
        // Celle qu'on tire reste prise, meme si l'orbite la cache un instant.
        const cachee = !!cachees[k] && glisse.current?.id !== p.id;
        return (
          <g key={p.id} className={'poigneeToit' + (DEPLACEMENTS.has(p.id) ? ' deplacer' : '') + (cachee ? ' cachee' : '')} data-poignee={p.id} data-cachee={cachee ? '' : undefined}
            transform={'translate(' + q.x + ',' + q.y + ')'} role="button" aria-label={p.libelle + (cachee ? ' (cachée par le toit : tournez autour du bâtiment)' : '')} aria-disabled={cachee || undefined}
            onPointerDown={(ev) => { if (!cachee) demarrer(ev, p); }} onPointerMove={bouger} onPointerUp={finir} onPointerCancel={finir}>
            {vrai && Math.hypot(vrai.x - q.x, vrai.y - q.y) > SAISIE_PX && <line className="renvoiPoignee" x1={0} y1={0} x2={vrai.x - q.x} y2={vrai.y - q.y} />}
            <title>{p.libelle}</title>
            <circle className="saisiePoignee" r={SAISIE_PX} />
            {DEPLACEMENTS.has(p.id) ? <>
              <rect className="pointPoignee" x={-RAYON_DEPLACER_PX} y={-RAYON_DEPLACER_PX} width={2 * RAYON_DEPLACER_PX} height={2 * RAYON_DEPLACER_PX} rx={4} />
              <path className="flechesPoignee" d={FLECHES} />
            </> : <circle className="pointPoignee" r={RAYON_PX} />}
          </g>
        );
      })}
      {ancre && cotes.length > 0 && (
        <foreignObject x={Math.max(4, Math.min(r.width - 220, ancre.x - 100))} y={Math.max(4, ancre.y - 62)} width={200} height={34}>
          <div className="cotesToit" role="status">{cotes.map((c) => <span key={c.cle} className="coteToit" data-cote={c.cle}>{c.texte}</span>)}</div>
        </foreignObject>
      )}
    </svg>
  );
}

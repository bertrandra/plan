// Choisir un objet en le touchant dans la Vue 3D (demande du proprietaire, 6 novembre 2026) : un batiment, une terrasse, une pergola
// ou un carport, une piscine (`model/fonctions.ts::estChoisiEn3d`).
//
// C'est la selection du plan, la meme : l'inspecteur, l'explorateur et le bouton « Modifier la toiture » la suivent. Ce n'est pas une
// ecriture : ni Ctrl+Z, ni « projet modifie », permise en lecture seule. Un toucher bref sans glisser (un glisser tourne la vue, un
// pincement zoome) ; un arbre ou un parasol devant laisse passer le rayon ; un toucher dans le vide (sol, ciel) ou sur un objet qui ne se
// choisit pas (cloture, chemin, massif) lache la selection, comme un clic dans le vide du plan (decision du proprietaire, 6 novembre 2026).
//
// Le mode Toit, l'audit (promenade et audit de la parcelle), l'avant / apres et la promenade de la Vue 3D gardent leurs propres
// touchers : la selection s'y tait. L'objet choisi se voit dans la scene par le trait renforce de l'audit (three/traitDePres.ts),
// pose et retire au fil de la selection.

import { estArbre, estChoisiEn3d, estParasol, estTerrasse } from '../../model/fonctions.js';
import { enPoints } from '../../model/formes.js';
import { pointInPolygon } from '../../geometry/basic.js';
import { affichage3d, abonnerSceneBatie, hotes3d, vue3d } from '../../three/etat3d.js';
import { moteur3d } from '../../three/demande3d.js';
import { sessionToit } from '../toits/modeToit.js';
import { controleurAudit } from '../audit/courant.js';
import { parcours } from '../parcours.js';
import { promenadeActive } from '../../three/presentation.js';
import type { Atelier } from '../atelier.js';
import type { Magasin } from '../magasin.js';
import type { ObjetPlan, PtBrut } from '../../model/types.js';

/** Un doigt (ou la souris) qui bouge de plus que cela glisse : il tourne la vue, il ne choisit rien. */
export const TOUCHER_PX = 6;
/** Un appui plus long que cela n'est pas un toucher (il prepare un glisser, ou un appui long). */
export const TOUCHER_MS = 450;

/** Les autres maitres du toucher de la Vue 3D : tant que l'un d'eux est la, la selection au toucher se tait. */
export function toucherPrisAilleurs(): boolean {
  const p = parcours.courant()?.type;
  return !!sessionToit() || !!controleurAudit() || p === 'auditParcelle' || p === 'auditCas' || p === 'auditFin'
    || !!affichage3d.comparaison || promenadeActive();
}

/**
 * L'objet que le toucher choisit, parmi `objets` : le premier que le rayon rencontre (`toucher`), les arbres et les parasols traverses.
 * La terrasse courante n'est pas posee comme un objet du plan (son platelage est la scene de la terrasse) : un toucher qui ne rencontre
 * aucun objet tombe sur elle si son point est dans une terrasse. Null : le vide, ou un objet qui ne se choisit pas en 3D.
 */
export function objetChoisi(objets: readonly ObjetPlan[], toucher: (retenir: (cle: string) => boolean) => { cle: string | null; point: PtBrut | null }): ObjetPlan | null {
  const parCle = new Map(objets.map((o) => [o.key, o]));
  // Un arbre ou un parasol au-dessus de ce qu'on vise laisse passer le rayon : sa toile couvre la terrasse vue d'en haut.
  const { cle, point } = toucher((k) => { const o = parCle.get(k); return !o || !(estArbre(o) || estParasol(o)); });
  const o = cle ? parCle.get(cle) : undefined;
  if (o) return estChoisiEn3d(o) ? o : null;
  return point ? objets.find((x) => estTerrasse(x) && x.type === 'polygon' && pointInPolygon(point, enPoints(x).pts)) ?? null : null;
}

/** Un geste bref et immobile, d'un seul doigt : un toucher. */
export function estUnToucher(debut: { x: number; y: number; t: number }, fin: { x: number; y: number; t: number }, doigts: number): boolean {
  return doigts <= 1 && Math.hypot(fin.x - debut.x, fin.y - debut.y) <= TOUCHER_PX && fin.t - debut.t <= TOUCHER_MS;
}

/**
 * Les touchers sur la scene de la Vue 3D : un geste bref et immobile, d'un seul doigt ou du bouton principal (`estUnToucher`), commence et
 * fini sur le canevas. Un glisser (l'orbite), un pincement, un appui long, le bouton droit n'en sont pas. Les doigts sont suivis un a un :
 * un pincement dont un doigt reste immobile n'est pas un toucher. Le mode Toit et la selection au toucher en ont un chacun.
 */
export function ecouterLesTouchers(doc: Document | null, auToucher: (e: PointerEvent) => void): void {
  const surLaScene = (e: Event): boolean => { const h = hotes3d.vue3d, t = e.target; return !!h && t instanceof HTMLCanvasElement && h.contains(t); };
  let debut: { x: number; y: number; t: number } | null = null, doigtsMax = 0;
  const doigts = new Set<number>();
  doc?.addEventListener('pointerdown', (e) => {
    // Le bouton principal seul : le droit (ou deux doigts) deplace la vue.
    if (!surLaScene(e) || e.button !== 0) return;
    // Un pointeur premier (la souris, le premier doigt pose) commence un nouveau geste : un doigt dont la levee s'est perdue ne bloque
    // jamais les touchers suivants.
    if (e.isPrimary) doigts.clear();
    doigts.add(e.pointerId);
    doigtsMax = Math.max(doigtsMax, doigts.size);
    // L'heure du geste lui-meme (`timeStamp`), pas celle ou il est traite : une image longue a rendre ne fait pas d'un toucher un appui long.
    if (doigts.size === 1) { debut = { x: e.clientX, y: e.clientY, t: e.timeStamp }; doigtsMax = 1; }
  }, true);
  const lacher = (e: PointerEvent, annule: boolean) => {
    if (!doigts.delete(e.pointerId)) return;
    const d = debut;
    if (doigts.size > 0) return;
    debut = null;
    if (annule || !d || !estUnToucher(d, { x: e.clientX, y: e.clientY, t: e.timeStamp }, doigtsMax)) return;
    auToucher(e);
  };
  doc?.addEventListener('pointerup', (e) => { lacher(e, false); }, true);
  doc?.addEventListener('pointercancel', (e) => { lacher(e, true); }, true);
}

export function brancherSelection3d(a: Atelier, magasin: Magasin, doc: Document | null = typeof document === 'undefined' ? null : document): void {
  ecouterLesTouchers(doc, (e) => {
    if (magasin.store.getState().vue !== 'vue3d' || toucherPrisAilleurs()) return;
    const toile = vue3d.scene?.renderer.domElement;
    if (!toile) return;
    const r = toile.getBoundingClientRect();
    const ndc = { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 };
    const o = objetChoisi(a.etat.objects, (retenir) => moteur3d()?.objetSousLePointeur(ndc, retenir) ?? { cle: null, point: null });
    // Le vide (sol, ciel) ou un objet qui ne se choisit pas : la selection est lachee (decision du proprietaire, 6 novembre 2026).
    const cle = o?.key ?? null;
    if (cle === a.etat.selectedKey) return;
    a.etat.selectedKey = cle;
    a.etat.highlight = { type: null, index: null };
    a.rebuildSelector();
    a.render();
  });

  // Le trait de l'objet choisi : pose a chaque changement de la selection ou de la scene, retire hors de la Vue 3D et quand un autre
  // maitre du toucher a la main (le mode Toit dessine sa silhouette, l'audit son propre trait).
  let pose: { cle: string; racines: readonly object[] } | null = null;
  const suivre = (): void => {
    const m = moteur3d(), sc = vue3d.scene;
    if (!m || !sc) { pose = null; return; }
    const o = a.etat.objects.find((x) => x.key === a.etat.selectedKey);
    const voulu = o && estChoisiEn3d(o) && magasin.store.getState().vue === 'vue3d' && !toucherPrisAilleurs() ? o : null;
    const racines = voulu ? m.racinesDe3d(voulu.key) : [];
    // Les memes mailles : rien a refaire (le trait est calcule une fois par objet et par scene ; un objet redessine a de nouvelles mailles).
    if (pose && voulu?.key === pose.cle && racines.length === pose.racines.length && racines.every((r, i) => r === pose?.racines[i])) return;
    if (!voulu && !pose) return;
    m.poserTraitDePres(null, 0);
    if (pose && !pose.racines.length) m.surlignerDans3d(null, [], false);
    if (voulu && racines.length) m.poserTraitDePres(voulu.key, 1);
    // La terrasse courante n'a pas de mailles a elle (son platelage est la scene) : son contour se surligne, au ras du platelage.
    else if (voulu) {
      const pts = enPoints(voulu).pts as PtBrut[], n = pts.length || 1;
      const centre = { x: pts.reduce((t, p) => t + p.x, 0) / n, y: pts.reduce((t, p) => t + p.y, 0) / n };
      m.surlignerDans3d({ formes: [{ pts, bas: 0, haut: 0.3, ferme: true }], centre, hautM: 0.3, normale: null }, [], false);
    }
    pose = voulu ? { cle: voulu.key, racines } : null;
    m.demanderRendu(sc);
  };
  magasin.store.subscribe(suivre);
  abonnerSceneBatie(() => { pose = null; suivre(); });
}

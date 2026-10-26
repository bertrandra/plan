// Le controleur de l audit : la promenade sur le plan, sa reprise, le depart d une adresse, son partage.
// Un morceau de app/audit/controleur.ts, qui le reexporte : le reste du programme importe depuis lui.

import { dialogues } from '../../../shell/dialogues.js';
import { stockageNavigateur } from '../../../io/brouillonAudit.js';
import { geocoderBAN, geocoderInverseBAN } from '../../../geo/apiIgn.js';
import { lireGrilleSous } from '../../../geo/mnh.js';
import { centroid } from '../../../geometry/basic.js';
import { facadesDuContour } from '../../../facade/geometrie.js';
import { elevationOf } from '../../../engine/hauteurs.js';
import { aDesSommets } from '../../../model/formes.js';
import { creerPromenade, type Promenade } from '../promenade.js';
import { creerReprise, type RepriseAudit } from '../reprise.js';
import { entreesDe, sortiesDe, identiteDe } from '../cas.js';
import { creerCouleursPhotos, type CouleursPhotos } from '../couleurFacade.js';
import { limitesDesParcelles } from '../../../render/couleurMurPhoto.js';
import type { ProjecteurLocal } from '../../../geo/projection.js';
import type { EtatApp } from '../../../core/state.js';
import type { ObjetPlan } from '../../../model/types.js';
import { type ContexteAudit } from './contexte.js';
import { estBatiment, facadeDevantDans } from './cap.js';

/** La couleur des facades sur les photos des cas, branchee sur le plan : murs, facade devant la prise, clotures. */
export function couleursDuPlan(etat: EtatApp, promenade: Promenade): CouleursPhotos {
  const objet = (cle: string) => etat.objects.find((o) => o.key === cle);
  return creerCouleursPhotos({
    promenade,
    facades: (cle) => { const o = objet(cle); return estBatiment(o) && aDesSommets(o) ? facadesDuContour(o.pts, elevationOf(o)) : []; },
    devant: (cle, p, cap) => facadeDevantDans(etat.objects, p, cap, cle)?.facade ?? null,
    limites: () => limitesDesParcelles(etat.objects),
  });
}

/** La promenade, branchee sur le plan : ce qu'elle fige d'un batiment, sa grille LiDAR, son adresse. */
export function promenadeDuPlan(ctx: ContexteAudit, projecteur: () => ProjecteurLocal | null): Promenade {
  const { etat } = ctx;
  const objet = (cle: string) => etat.objects.find((o) => o.key === cle);
  return creerPromenade({
    figer: (cle) => {
      const o = objet(cle);
      if (!estBatiment(o)) return null;
      return { identite: { ...identiteDe(o, etat.objects), adresse: null }, entrees: entreesDe(o, etat.objects, null), sorties: sortiesDe(o) };
    },
    lireGrille: async (cle) => {
      const o = objet(cle), proj = projecteur();
      return proj && estBatiment(o) && aDesSommets(o) ? (ctx.lireGrille ?? lireGrilleSous)(o.pts, proj) : null;
    },
    adresse: async (cle) => {
      const o = objet(cle), proj = projecteur();
      if (!proj || !estBatiment(o) || !aDesSommets(o)) return null;
      const c = centroid(o.pts), d = proj.versDegres(c.x, c.y);
      return (await (ctx.adresse ?? geocoderInverseBAN)(d.lon, d.lat))?.label ?? null;
    },
  });
}

/** Le brouillon local de la promenade (app/audit/reprise.ts), branche sur le plan et les dialogues. */
export function repriseDuControleur(ctx: ContexteAudit, promenade: Promenade, dire: (s: string) => void, partir: (lon: number, lat: number) => Promise<void>): RepriseAudit {
  const present = (cle: string) => estBatiment(ctx.etat.objects.find((o) => o.key === cle));
  return creerReprise({
    promenade, stockage: ctx.stockageBrouillon === undefined ? stockageNavigateur() : ctx.stockageBrouillon, delaiMs: ctx.delaiBrouillonMs,
    questionner: ctx.questionner ?? ((d) => dialogues.ouvrir(d)), signaler: ctx.signaler, dire,
    commune: () => communeDu(ctx.etat.objects), present, repeindre: ctx.repeindre3d, partir,
  });
}

/** Le depart d'une adresse (`?depart=`) : geocodee, puis la parcelle sous elle. */
export function partirDeLAdresse(ctx: ContexteAudit, adresse: string, dire: (s: string) => void, partir: (lon: number, lat: number) => Promise<void>): void {
  void (ctx.geocoder ?? geocoderBAN)(adresse, false).then((r) => {
    const a = r[0];
    if (!a) { dire('Adresse de départ introuvable.'); return; }
    void partir(a.lon, a.lat);
  }).catch(() => dire('Adresse de départ introuvable.'));
}

/** La commune de la parcelle de depart, quand elle est connue. */
function communeDu(objets: readonly ObjetPlan[]): string | null {
  const cad = objets.find((o) => o.key === 'parcelle')?.cadastre as { commune?: string } | undefined;
  return cad?.commune ?? null;
}

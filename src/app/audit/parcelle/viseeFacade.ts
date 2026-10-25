// La facade visee pendant l'audit de la parcelle (controleur.ts) : reconnue par la position et le cap, ou choisie dans la liste ;
// surlignee en 3D des qu'elle change.

import { ecartCap } from '../../../shell/boussole.js';
import { poserFacadeDevant, ROUGE_FACADE, VERT_FACADE } from '../../../three/facadeDevant3d.js';
import type { CaptureEnCours } from './capture.js';
import type { LigneFacade, ListeDeControle } from './liste.js';
import { cleFacade, entreesReconnaissance, facadeRetenue, facadesProposees } from './reconnaissance.js';
import type { Facade } from '../../../facade/geometrie.js';
import type { FacadeDevant } from '../../../facade/calage/priseDeVue.js';
import type { PtBrut } from '../../../model/types.js';
import type { ContexteAuditParcelle, CibleFacade } from './typesSession.js';
import type { capteurs } from './capteursPrise.js';
import { textePlanDePrise } from './textesSession.js';

/** La facade devant vous ne se recherche que si la boussole a tourne d'au moins cela : elle tremble. */
const PAS_RECONNAISSANCE_DEG = 2;
/** Les facades ecartees (« Ce n'est pas cette façade ») le restent tant qu'on ne s'est pas deplace de cela. */
const DEPLACEMENT_OUBLI_M = 5;

/**
 * La facade visee : reconnue par la position et le cap, ou choisie dans la liste. Surlignee en 3D
 * des qu'elle change ; les facades ecartees sont oubliees quand on s'est deplace.
 */
export function viseeDe(ctx: ContexteAuditParcelle, liste: () => ListeDeControle, publier: () => void) {
  const surligner = ctx.surligner ?? ((f: Facade | null, teinte: number) => poserFacadeDevant(f, teinte));
  let reconnue: FacadeDevant | null = null;
  let choisie: { cle: string; cote: number } | null = null;
  /**
   * Le batiment verrouille pour la prise (action volontaire de la personne, quand la parcelle porte
   * une annexe) : seul lui est reconnu et touche ; les autres restent des obstacles a la vue.
   */
  let verrou: string | null = null;
  let capReconnu: number | null = null;
  const ecartees = new Set<string>();
  let ecartDepuis: PtBrut | null = null;
  let surlignee: string | null = null;
  type Sens = ReturnType<typeof capteurs>;

  const proposees = (sens: Sens): FacadeDevant[] => {
    const p = sens.position();
    if (!p) return [];
    const { batiments, obstacles } = entreesReconnaissance(ctx.etat.objects, liste().batiments, p, verrou);
    return facadesProposees(p, sens.cap(), batiments, obstacles);
  };
  /**
   * La facade a surligner : la choisie, sinon la reconnue. Rouge tant qu'elle n'a pas de photo, verte
   * ensuite : rouge sur vert faisait du brun (essai d'AE 101), et une facade photographiee doit se
   * voir comme telle, visee ou non. Le surlignage ne bouge que si la facade ou sa teinte change.
   */
  function surlignerCourante(): void {
    const f = cibleFacade();
    const teinte = f && estPhotographiee(f.cle, f.facade.cote) ? VERT_FACADE : ROUGE_FACADE;
    const cle = f ? cleFacade(f.cle, f.facade.cote) + '/' + teinte : null;
    if (cle === surlignee) return;
    surlignee = cle;
    surligner(f ? f.facade : null, teinte);
  }
  const estPhotographiee = (cle: string, cote: number) =>
    liste().batiments.find((b) => b.cle === cle)?.facades.find((x) => x.cote === cote)?.statut === 'photographiee';
  /** La facade telle qu'on la montre : son mur jusque sous le toit, par morceaux (liste.ts, `profilMur`). */
  const montree = (cle: string, f: Facade): Facade => {
    const l = liste().batiments.find((b) => b.cle === cle)?.facades.find((x) => x.cote === f.cote);
    return l ? facadeMontree(l) : f;
  };
  function cibleFacade(): { cle: string; facade: Facade; distance: number | null } | null {
    if (choisie) {
      const { cle, cote } = choisie;
      const f = liste().batiments.find((b) => b.cle === cle)?.facades.find((x) => x.cote === cote);
      return f ? { cle, facade: montree(cle, f.facade), distance: reconnue && reconnue.cle === cle && reconnue.facade.cote === cote ? reconnue.distance : null } : null;
    }
    return reconnue ? { cle: reconnue.cle, facade: montree(reconnue.cle, reconnue.facade), distance: reconnue.distance } : null;
  }
  function reconnaitre(sens: Sens): void {
    capReconnu = sens.cap();
    const p = sens.position();
    if (p && ecartDepuis && Math.hypot(p.x - ecartDepuis.x, p.y - ecartDepuis.y) > DEPLACEMENT_OUBLI_M) { ecartees.clear(); ecartDepuis = null; }
    reconnue = facadeRetenue(proposees(sens), ecartees);
    surlignerCourante();
  }
  return {
    reconnaitre,
    capteurs(sens: Sens, quoi: 'position' | 'cap'): void {
      const cap = sens.cap();
      if (quoi === 'cap' && capReconnu !== null && cap !== null && Math.abs(ecartCap(capReconnu, cap)) < PAS_RECONNAISSANCE_DEG) return;
      reconnaitre(sens);
      publier();
    },
    choisir(cle: string | null, cote: number | null): void {
      choisie = cle !== null && cote !== null ? { cle, cote } : null;
      // Choisir une facade d'un autre batiment, c'est choisir ce batiment : le verrou le suit.
      if (verrou !== null && cle !== null && cle !== verrou) verrou = cle;
      surlignerCourante();
    },
    /** Verrouille un batiment (ou rend la main avec `null`) ; la facade reconnue ou choisie chez un autre est oubliee. */
    verrouiller(cle: string | null, sens: Sens): void {
      verrou = cle;
      if (cle !== null && choisie && choisie.cle !== cle) choisie = null;
      ecartees.clear(); ecartDepuis = null;
      reconnaitre(sens);
    },
    verrou: (): string | null => verrou,
    /** Ecarte la facade reconnue ; rend la phrase a dire quand il n'y en a pas d'autre. */
    ecarter(sens: Sens): string | null {
      if (choisie) { choisie = null; reconnaitre(sens); return null; }
      if (!reconnue) return 'Aucune façade reconnue devant vous : touchez-la dans la 3D, ou choisissez-la dans la liste.';
      const actuelle = cleFacade(reconnue.cle, reconnue.facade.cote);
      ecartees.add(actuelle);
      ecartDepuis ??= sens.position();
      const toutes = proposees(sens);
      let suivante = facadeRetenue(toutes, ecartees);
      // Toutes ecartees : on repart du debut de la liste, sans la facade refusee a l'instant.
      if (!suivante) { ecartees.clear(); ecartees.add(actuelle); suivante = facadeRetenue(toutes, ecartees); }
      if (!suivante) { ecartees.clear(); return 'Aucune autre façade devant vous : touchez-la dans la 3D, ou choisissez-la dans la liste.'; }
      reconnue = suivante;
      surlignerCourante();
      return null;
    },
    cible(capture: CaptureEnCours): CibleFacade | null {
      const f = cibleFacade();
      if (!f) return null;
      const ligne = liste().batiments.find((b) => b.cle === f.cle);
      const photos = capture.lire().batiments[f.cle]?.facades[String(f.facade.cote)]?.photos.length ?? 0;
      return {
        cle: f.cle, cote: f.facade.cote, facade: f.facade, nom: 'la façade ' + f.facade.orientation.toLowerCase() + ' de ' + (ligne?.nom ?? f.cle),
        distance: f.distance, choisie: !!choisie, photos, plan: f.distance !== null ? textePlanDePrise(f.facade, f.distance) : null,
      };
    },
    oublier(): void { reconnue = null; verrou = null; surlignee = null; surligner(null, ROUGE_FACADE); },
    facade: (): Facade | null => cibleFacade()?.facade ?? null,
    /** Vrai si la facade visee a ete choisie (touchee, ou dans la liste) plutot que reconnue. */
    choisie: (): boolean => choisie !== null,
    /** Le batiment de la facade visee, ou null. */
    cleBatiment: (): string | null => cibleFacade()?.cle ?? null,
    /** La cle de la facade visee (batiment et cote), ou null. */
    cleVisee: (): string | null => { const f = cibleFacade(); return f ? cleFacade(f.cle, f.facade.cote) : null; },
  };
}

/** Une ligne de la liste, telle que la Vue 3D la montre : le mur jusque sous le toit, et son haut par morceaux. */
export const facadeMontree = (l: LigneFacade): Facade => ({ ...l.facade, hauteur: l.hauteurMur, profil: l.profilMur } as Facade);

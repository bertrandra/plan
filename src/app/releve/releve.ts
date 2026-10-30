// L'editeur d'une facade relevee vu du reste du programme (MD/spec-facade-calage-audit.md §6, lot F6 ; spec-releve-facade §10).
//
// Depuis le lot F6, les photos de facade se prennent, se redressent et s'assemblent dans l'audit de la parcelle : le releve n'a plus
// de capture. Il reste l'editeur d'une facade deja relevee (zones/Releve.tsx) : corriger ses ouvertures (nature, cotes, ajout,
// retrait, verification) et la partie basse d'un mur en L. Ce service lui dit sur quel mur il travaille, et c'est lui seul qui ecrit
// le resultat dans le projet : un instantane d'historique d'abord (Ctrl+Z defait l'edition d'un coup), puis le releve, et les rendus
// qui doivent suivre. Rien d'autre du releve ne change : sa texture, son calage, sa Facade validee (dimensions, forme, pose de la
// texture) restent tels quels, et un releve d'avant se rouvre et se reecrit sans rien perdre (`releveEdite`).

import { vue3d } from '../../three/etat3d.js';
import { terrasseCourante } from '../../core/contexteTerrasse.js';
import { showToast } from '../../shell/dialogs.js';
import { facadesDuContour } from '../../geometry/cotesVusDeDehors.js';
import { avecGrille, tracerCorrections } from '../../facade/detection/verification.js';
import { numeroterOuvertures } from '../../model/facadeObjet.js';
import type { EtatApp } from '../../core/state.js';
import type { ObjetPlan, ObjetPolygone, OuvertureFacade, PartieBasse, ReleveFacade } from '../../model/types.js';
import { champsBatiment } from '../../model/champsFonction.js';

export interface ContexteReleve {
  etat: EtatApp;
  pushHistory: () => void;
  render: () => void;
  buildThreeScene: (obj: ObjetPlan | null) => void;
  /** Le jour (AAAA-MM-JJ) que porte une ouverture verifiee ; par defaut, aujourd'hui. */
  aujourdhui?: () => string;
}

/** Ce qui est ouvert : le batiment et son mur releve. */
export interface ReleveOuvert {
  objKey: string;
  cote: number;
}

/** Ce que la personne retient a la fin de l'edition. */
interface EditionReleve {
  ouvertures: OuvertureFacade[];
  partieBasse: PartieBasse | null;
}

export interface ServiceReleve {
  courant(): ReleveOuvert | null;
  abonner(cb: () => void): () => void;
  /** Ouvre l'editeur sur le mur `cote` du batiment, s'il a un releve ; sinon rien ne s'ouvre (la photo se prend dans l'audit). */
  ouvrir(objKey: string, cote: number): void;
  fermer(): void;
  /** Le batiment du releve ouvert, tel qu'il est maintenant dans le plan. */
  batiment(): ObjetPolygone | null;
  /** Le releve ouvert, tel qu'il est maintenant dans le plan. */
  releve(): ReleveFacade | null;
  /** Le jour d'aujourd'hui (AAAA-MM-JJ), pour la verification d'une ouverture. */
  aujourdhui(): string;
  /** Ecrit l'edition dans le projet, en un pas d'historique ; rien quand rien n'a change. Ferme l'editeur. */
  valider(e: EditionReleve): void;
}

const memes = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Le releve apres l'edition, ou null quand rien n'a change (rien ne s'ecrit, pas meme un pas d'historique). Les ouvertures retenues
 * sont comparees a celles du releve pour tracer les corrections (spec facades §12) : une ouverture deplacee ou d'un autre type devient
 * `corrigee`, une ajoutee `ajoutee`, et chaque geste s'ajoute aux corrections deja tracees ; la grille est recalculee sur elles. Sur une
 * facade objet (ses ouvertures ont un identifiant, lot F5), une ouverture nouvelle en recoit un. Tout le reste du releve (texture,
 * calage, Facade validee, photo locale, seuils de la detection) est garde tel quel. Edite a la main, le releve n'est plus celui que
 * l'audit a pose tout seul : `depuisAudit` tombe, une nouvelle mesure ne le remplacera plus d'office.
 */
function releveEdite(r: ReleveFacade, e: EditionReleve): ReleveFacade | null {
  if (memes(e.ouvertures, r.ouvertures) && memes(e.partieBasse ?? null, r.partieBasse ?? null)) return null;
  const { ouvertures: tracees, corrections } = tracerCorrections(r.ouvertures, [], e.ouvertures);
  const { ouvertures: rangees, grille } = avecGrille(tracees, r.largeur);
  const ouvertures = r.ouvertures.some((o) => o.id) ? numeroterOuvertures(rangees, r.ouvertures) : rangees;
  const out: ReleveFacade = { ...r, ouvertures };
  // Un releve d'avant sans partie basse le reste : la cle ne s'ajoute pas pour dire « aucune ».
  if (e.partieBasse || r.partieBasse !== undefined) out.partieBasse = e.partieBasse;
  if (grille) out.grille = grille; else delete out.grille;
  const toutes = [...(r.corrections ?? []), ...corrections];
  if (toutes.length) out.corrections = toutes;
  delete out.depuisAudit;
  return out;
}

const jourDuJour = () => new Date().toISOString().slice(0, 10);

export function creerServiceReleve(ctx: ContexteReleve): ServiceReleve {
  let courant: ReleveOuvert | null = null;
  const abonnes = new Set<() => void>();
  const annoncer = () => abonnes.forEach((cb) => cb());

  const batiment = (): ObjetPolygone | null => {
    const ouvert = courant;
    if (!ouvert) return null;
    const o = ctx.etat.objects.find((x) => x.key === ouvert.objKey);
    return o && o.type === 'polygon' ? o : null;
  };
  const releve = (): ReleveFacade | null => {
    const o = batiment(), cote = courant?.cote;
    return (o?.batiment?.facades || []).find((r) => r.cote === cote) ?? null;
  };

  return {
    courant: () => courant,
    abonner(cb) {
      abonnes.add(cb);
      return () => abonnes.delete(cb);
    },
    ouvrir(objKey, cote) {
      const o = ctx.etat.objects.find((x) => x.key === objKey);
      if (!o?.batiment?.facades?.some((r) => r.cote === cote)) return;
      courant = { objKey, cote };
      annoncer();
    },
    fermer() {
      courant = null;
      annoncer();
    },
    batiment,
    releve,
    aujourdhui: ctx.aujourdhui ?? jourDuJour,
    valider(e) {
      const o = batiment(), r = releve();
      const fait = o && r ? releveEdite(r, e) : null;
      if (o && fait) {
        ctx.pushHistory();
        champsBatiment(o).facades = (o.batiment?.facades || []).map((x) => (x.cote === fait.cote ? fait : x));
        ctx.render();
        if (vue3d.scene) ctx.buildThreeScene(terrasseCourante(ctx.etat) || null);
        const f = facadesDuContour(o.pts, fait.hauteur).find((x) => x.cote === fait.cote);
        const n = fait.ouvertures.length;
        showToast(`Façade ${f ? f.orientation.toLowerCase() + ' ' : ''}modifiée : ${n} ouverture${n > 1 ? 's' : ''}. Ctrl+Z la rend telle qu’elle était.`);
      }
      courant = null;
      annoncer();
    },
  };
}

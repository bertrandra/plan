// Les parcours en plusieurs etapes (spec-ihm-zones §4.8, Z8) : l'import cadastral depuis une adresse,
// l'actualisation IGN, le choix d'une texture, les fiches du mode audit, l'audit de la parcelle et la
// declaration prealable.
//
// Ce sont des dialogues, mais pas des questions : ils portent leur propre etat et leur propre
// logique. Ce module tient celui qui est ouvert — un seul a la fois — et previent la zone qui le
// dessine (zones/Parcours.tsx). La logique de chacun vit a cote : `importCadastre.ts`,
// `actualisationIgn.ts`, `io/polyhaven.ts`.

import type { ImportCadastre } from './cadastre/importCadastre.js';
import type { InfosActualisation, OptionsActualisation } from './cadastre/optionsActualisation.js';
import type { TextureAppliquee } from '../model/types.js';
import type { Promenade } from './audit/promenade.js';
import type { CouleursPhotos } from './audit/couleurFacade.js';
import type { PrisePhoto } from '../model/audit.js';
import type { SessionAuditParcelle } from './audit/parcelle/controleur.js';
import type { CatalogueAudits } from './audit/parcelle/catalogue.js';
import type { Champ, ContexteChamps } from '../ui/champs/types.js';
import type { ObjetPlan } from '../model/types.js';
import type { ServiceDossier } from './declaration/serviceDossier.js';

export type Parcours =
  | { type: 'cadastre'; importe: ImportCadastre }
  | { type: 'actualisation'; infos: InfosActualisation; lancer: (options: OptionsActualisation) => void }
  | {
      type: 'texture';
      titre: string;
      /** Une case facultative sous la grille (« appliquer a toutes les clotures »). */
      caseLibelle?: string | undefined;
      choisir: (choix: TextureAppliquee, appliquerATous: boolean) => void;
    }
  /** Mode audit : la fiche d'un batiment marque (app/audit/controleur.ts). */
  | { type: 'auditCas'; promenade: Promenade; cle: string; retirer: () => void; prise: () => PrisePhoto | null; couleurs?: CouleursPhotos; retour?: () => void }
  /** Mode audit : la liste de fin de promenade, puis le partage du fichier. */
  | { type: 'auditFin'; promenade: Promenade; modifier: (cle: string) => void; retirer: (cle: string) => void; partager: () => Promise<void> }
  /** L'audit de la parcelle du projet, phase 1 : la liste de controle et l'ecran de prise (app/audit/parcelle/). */
  /** `retour` : une consultation d'audit recu (Admin › Audits), en lecture seule, d'ou l'on revient aux audits. */
  | { type: 'auditParcelle'; session: SessionAuditParcelle; retour?: () => void }
  /** Admin › Audits de parcelle : les audits recus sur le serveur (app/audit/parcelle/catalogue.ts). */
  | { type: 'auditsParcelle'; catalogue: CatalogueAudits }
  /**
   * La declaration prealable (menu Exporter) : qui declare, l'adresse, puis le dossier. Ses champs sont
   * ceux de ui/champs/declaration.ts, ecrits sur la parcelle du projet par le service de l'inspecteur ; `dossier`, ses textes, ses
   * photographies et sa relecture (lot L5, app/declaration/serviceDossier.ts).
   */
  | { type: 'declaration'; service: ServiceChampsParcours; dossier?: ServiceDossier };

/**
 * Ce qu'un parcours qui rend des champs demande au service de l'inspecteur (app/inspecteur.ts) : la
 * parcelle du projet, le contexte d'un objet, l'ecriture. Decrit ici plutot qu'importe, pour que
 * l'inspecteur, qui ouvre des parcours, et les parcours ne s'importent pas l'un l'autre.
 */
export interface ServiceChampsParcours {
  parcelle(): ObjetPlan | undefined;
  contexte(obj: ObjetPlan): ContexteChamps;
  appliquer(champ: Champ, c: ContexteChamps, ecrire: () => void | boolean): boolean;
  executer(champ: Champ, c: ContexteChamps): void;
}

let courant: Parcours | null = null;
/** Change a chaque ouverture : deux parcours du meme type ne partagent pas l'etat de leur ecran. */
let numero = 0;
const abonnes = new Set<() => void>();

export const parcours = {
  courant: (): Parcours | null => courant,
  numero: (): number => numero,
  abonner(f: () => void): () => void { abonnes.add(f); return () => { abonnes.delete(f); }; },
  /** Ouvre un parcours ; celui qui etait ouvert est abandonne. */
  ouvrir(p: Parcours): void { courant = p; numero++; abonnes.forEach(f => f()); },
  fermer(): void {
    if (!courant) return;
    courant = null;
    abonnes.forEach(f => f());
  }
};

/**
 * Ouvre le choix d'une texture. `choisir` n'est appele qu'une fois l'image resolue, jamais pendant la
 * simple navigation dans le catalogue ; `options.checkboxLabel` ajoute une case, decochee par defaut.
 */
export function ouvrirSelecteurTexture(
  titre: string,
  choisir: (choix: TextureAppliquee, appliquerATous?: boolean) => void,
  options?: { checkboxLabel?: string }
): void {
  parcours.ouvrir({ type: 'texture', titre, caseLibelle: options?.checkboxLabel, choisir });
}

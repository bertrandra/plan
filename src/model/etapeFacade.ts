// L'enchainement d'une facade, etape par etape (MD/spec-facade-calage-audit.md §4 ter) : le contrat de chaque etape, comme une
// donnee. Ce que l'automatique fait, l'objectif qui dit qu'il a reussi, ce qui sort, et le geste de repli quand l'objectif n'est
// pas atteint. L'orchestrateur (facade/releve/enchainement.ts) calcule l'etat de chaque etape ; la barre de progression
// (zones/composants/BarreProgressionFacade.tsx) et les ecrans qui la portent ne font que le lire.
//
// L'etat est derive (comme le bilan du redressement) : il se recalcule a chaque rejeu, il n'est jamais enregistre comme verite.

/** Les etapes, dans l'ordre du tableau §4 ter.2 (E0 a E9). */
export type IdEtape =
  | 'preparation' | 'prises' | 'redressement' | 'assemblage' | 'calage'
  | 'silhouette' | 'diagnostic' | 'texture' | 'ouvertures' | 'toit' | 'validation';

/**
 * L'etat d'une etape calculee : objectif atteint, atteint de justesse (ou deux chemins qui divergent), non atteint, ou inutile ici.
 * Un echec arrete ce qui en depend ; une valeur supposee laisse la suite continuer en le disant (`a-confirmer`).
 */
export type EtatEtape = 'ok' | 'a-confirmer' | 'echec' | 'saute';

/** L'etat qu'une etape montre dans la barre : son etat calcule, ou pas encore (a venir, en cours). */
export type EtatAffiche = EtatEtape | 'a-venir' | 'en-cours';

/** Comment l'audit montre une etape (§4 ter.3) : un reglage d'affichage, jamais une propriete de la chaine. La calibration montre tout. */
export type ModeAudit = 'cache' | 'resume' | 'valider';

/** Les quatre points de validation de l'audit (§4 ter.3). */
export type PointValidation = 'V1' | 'V2' | 'V3' | 'V4';

/** Le contrat d'une etape (§4 ter.1). Des phrases pour les personnes ; les objectifs chiffres sont des reglages (regles/facades/enchainement.json). */
export interface EtapeFacade {
  id: IdEtape;
  /** E0 a E9, comme la spec les nomme. */
  numero: string;
  nom: string;
  entrant: string;
  action: string;
  /** Ce qui dit que l'automatique a reussi ; les seuils sont dans les reglages, ce texte le dit en clair. */
  objectif: string;
  sortant: string;
  /** Le geste de repli, propose seulement quand l'objectif n'est pas atteint ; null : rien a faire ici. */
  optionManuelle: string | null;
  modeAudit: ModeAudit;
  validation: PointValidation | null;
  /** Le lot de la spec qui fait tourner l'etape ; null : elle tourne deja. Une etape a venir est dite sautee, avec son lot. */
  lot: string | null;
}

export const ETAPES_FACADE: readonly EtapeFacade[] = [
  { id: 'preparation', numero: 'É0', nom: 'Préparation', entrant: 'le contour, les corps du toit, le LiDAR, le cadastre', action: 'les dimensions, le gabarit, le rapport hauteur sur largeur, les pointes attendues', objectif: 'un gabarit existe (un rectangle sinon)', sortant: 'les dimensions et le gabarit', optionManuelle: null, modeAudit: 'cache', validation: null, lot: null },
  { id: 'prises', numero: 'É1', nom: 'Prises', entrant: 'le côté choisi, le téléphone', action: 'la prise, située quand le téléphone le permet', objectif: 'au moins une photo du mur', sortant: 'les photos', optionManuelle: 'ajouter, retirer ou refaire une photo', modeAudit: 'valider', validation: null, lot: null },
  { id: 'redressement', numero: 'É2', nom: 'Redressement', entrant: 'les photos, les repères posés', action: 'chaque photo redressée entière, par ses repères, sinon par ses points de fuite', objectif: 'chaque photo redressée', sortant: 'les vues de face', optionManuelle: 'poser quatre repères (un rectangle du mur)', modeAudit: 'cache', validation: null, lot: null },
  { id: 'assemblage', numero: 'É3', nom: 'Assemblage', entrant: 'les vues de face', action: 'les vues assemblées (ORB et RANSAC de similitude)', objectif: 'toutes les vues assemblées', sortant: 'l’assemblage et ce qu’il montre', optionManuelle: 'retirer une photo, ou en prendre une autre qui recoupe le mur', modeAudit: 'cache', validation: null, lot: null },
  { id: 'calage', numero: 'É4', nom: 'Calage du mur', entrant: 'l’assemblage, le rapport du plan', action: 'les bouts, l’égout et le sol, par les arêtes puis la teinte du mur, jugés sans le toit (les angles, l’égout, le sol) ; une autre pose qui explique mieux la photo, sinon celle du plan seul, supposée ; les coins reportés sur chaque photo', objectif: 'une pose qui explique la photo (score d’explication et chaque angle au seuil) ; bouts, égout et sol à 3 % de la largeur contre la vérité', sortant: 'le mur sur l’assemblage', optionManuelle: 'tirer les bouts, l’égout et le sol', modeAudit: 'resume', validation: 'V1', lot: null },
  { id: 'silhouette', numero: 'É5', nom: 'Silhouette lue', entrant: 'l’assemblage calé', action: 'le haut du mur lu à la teinte, entre les bouts retenus', objectif: 'la silhouette lue sur au moins la moitié des colonnes', sortant: 'la silhouette lue', optionManuelle: 'désigner les pointes sur l’image', modeAudit: 'cache', validation: null, lot: null },
  { id: 'diagnostic', numero: 'É5 bis', nom: 'Diagnostic de forme', entrant: 'la silhouette lue, le gabarit', action: 'les variantes de toit, corps par corps', objectif: 'une proposition n’existe que si elle explique mieux l’image', sortant: 'les propositions de toit, les alertes de hauteur', optionManuelle: 'cocher ou décocher, ouvrir le Mode Toit', modeAudit: 'valider', validation: 'V2', lot: 'F4' },
  { id: 'texture', numero: 'É6', nom: 'Texture', entrant: 'l’assemblage calé', action: 'l’élévation calée, la fusion des vues, la version sans ombres', objectif: 'une texture posée sur le mur', sortant: 'la texture et la bande au-dessus de l’égout', optionManuelle: 'recadrer, activer ou non « sans ombres »', modeAudit: 'cache', validation: null, lot: null },
  { id: 'ouvertures', numero: 'É7', nom: 'Ouvertures', entrant: 'l’assemblage calé', action: 'la détection, la structure, le vote entre les vues', objectif: 'aucune ouverture seulement devinée (rappel, précision et cotes contre la vérité)', sortant: 'les ouvertures', optionManuelle: 'ajouter, retirer, déplacer, redimensionner', modeAudit: 'resume', validation: 'V3', lot: null },
  { id: 'toit', numero: 'É8', nom: 'Toit', entrant: 'les propositions confirmées', action: 'les observations du moteur, sur le corps concerné', objectif: 'observation acceptée, hauteurs du LiDAR inchangées', sortant: 'le toit ajusté par le moteur', optionManuelle: 'le Mode Toit', modeAudit: 'valider', validation: null, lot: 'F4' },
  { id: 'validation', numero: 'É9', nom: 'Validation', entrant: 'tout ce qui précède', action: 'le bilan de la façade', objectif: 'la personne a validé, en une étape d’historique', sortant: 'la façade écrite', optionManuelle: 'corriger n’importe quel sortant', modeAudit: 'valider', validation: 'V4', lot: 'F5' },
];

/** Le contrat d'une etape. */
export function etapeFacade(id: IdEtape): EtapeFacade {
  const e = ETAPES_FACADE.find((x) => x.id === id);
  if (!e) throw new RangeError('Etape de facade inconnue : ' + id);
  return e;
}

/** Un segment de la barre de progression (§4 ter.5) : des etapes regroupees pour rester lisible. E0, instantanee, n'en a pas. */
export interface SegmentFacade { numero: number; nom: string; etapes: readonly IdEtape[]; validation: PointValidation | null }

export const SEGMENTS_FACADE: readonly SegmentFacade[] = [
  { numero: 1, nom: 'Prise', etapes: ['prises'], validation: null },
  { numero: 2, nom: 'Image', etapes: ['redressement', 'assemblage'], validation: null },
  { numero: 3, nom: 'Mur', etapes: ['calage'], validation: 'V1' },
  { numero: 4, nom: 'Forme', etapes: ['silhouette', 'diagnostic'], validation: 'V2' },
  { numero: 5, nom: 'Texture', etapes: ['texture'], validation: null },
  { numero: 6, nom: 'Ouvertures', etapes: ['ouvertures'], validation: 'V3' },
  { numero: 7, nom: 'Toit', etapes: ['toit'], validation: null },
  { numero: 8, nom: 'Façade', etapes: ['validation'], validation: 'V4' },
];

/** Du pire au meilleur : l'etat d'un segment est le pire de ses etapes ; une etape sautee ne cache pas une etape faite. */
const GRAVITE: Record<EtatAffiche, number> = { echec: 0, 'a-confirmer': 1, 'en-cours': 2, 'a-venir': 3, ok: 4, saute: 5 };

/** L'etat d'un segment : le pire de ses etapes ; sautees toutes, il est saute. */
export function etatDuSegment(etats: readonly EtatAffiche[]): EtatAffiche {
  if (!etats.length) return 'a-venir';
  return etats.reduce((pire, e) => (GRAVITE[e] < GRAVITE[pire] ? e : pire));
}

/** L'etat en mots, pour le texte lu a voix haute et la ligne sous la barre. */
export const LIBELLES_ETAT: Record<EtatAffiche, string> = {
  ok: 'faite', 'a-confirmer': 'à confirmer', echec: 'en échec', saute: 'sautée', 'a-venir': 'à venir', 'en-cours': 'en cours',
};

// L'enchainement d'une facade, etape par etape (MD/spec-facade-calage-audit.md §4 ter) : le contrat de chaque etape, comme une
// donnee. Ce que l'automatique fait, l'objectif qui dit qu'il a reussi, ce qui sort, et le geste de repli quand l'objectif n'est
// pas atteint. L'orchestrateur (facade/releve/enchainement.ts) calcule l'etat de chaque etape ; la barre de progression
// (zones/composants/BarreProgressionFacade.tsx) et les ecrans qui la portent ne font que le lire.
//
// L'etat est derive (comme le bilan du redressement) : il se recalcule a chaque rejeu, il n'est jamais enregistre comme verite.
// Le doute du mur se transmet (decision du proprietaire, 3 novembre 2026) : tant que l'E5 est a confirmer, les etapes qui lisent le mur
// (E6 a E11) et qui atteignent leur objectif sont a confirmer aussi, « depend du mur a confirmer (E5) » ; le mur confirme par la
// personne (V1, « Confirmer le mur », l'etat `confirme`), elles retrouvent leur propre verdict.

/** Les etapes, dans l'ordre du tableau §4 ter.2 (E1 a E11). */
export type IdEtape =
  | 'preparation' | 'prises' | 'redressement' | 'assemblage' | 'calage'
  | 'silhouette' | 'diagnostic' | 'texture' | 'ouvertures' | 'toit' | 'validation';

/**
 * L'etat d'une etape calculee : objectif atteint, atteint de justesse (ou deux chemins qui divergent), non atteint, ou inutile ici.
 * Un echec arrete ce qui en depend ; une valeur supposee laisse la suite continuer en le disant (`a-confirmer`).
 * `confirme` : la personne a confirme ce que l'etape a donne (le mur au point V1, « Confirmer le mur ») ; ce n'est pas un `ok` de
 * l'automatique, et les deux se disent autrement (decision du proprietaire, 3 novembre 2026). Seule l'E5 le prend aujourd'hui.
 */
export type EtatEtape = 'ok' | 'confirme' | 'a-confirmer' | 'echec' | 'saute';

/** L'etat qu'une etape montre dans la barre : son etat calcule, ou pas encore (a venir, en cours). */
export type EtatAffiche = EtatEtape | 'a-venir' | 'en-cours';

/** Comment l'audit montre une etape (§4 ter.3) : un reglage d'affichage, jamais une propriete de la chaine. La calibration montre tout. */
export type ModeAudit = 'cache' | 'resume' | 'valider';

/** Les quatre points de validation de l'audit (§4 ter.3). */
export type PointValidation = 'V1' | 'V2' | 'V3' | 'V4';

/** Le contrat d'une etape (§4 ter.1). Des phrases pour les personnes ; les objectifs chiffres sont des reglages (regles/facades/enchainement.json). */
export interface EtapeFacade {
  id: IdEtape;
  /** E1 a E11, comme la spec les nomme. */
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
}

export const ETAPES_FACADE: readonly EtapeFacade[] = [
  { id: 'preparation', numero: 'É1', nom: 'Préparation', entrant: 'le contour, les corps du toit, le LiDAR, le cadastre', action: 'les dimensions, le gabarit, le rapport hauteur sur largeur, les pointes attendues', objectif: 'un gabarit existe (un rectangle sinon)', sortant: 'les dimensions et le gabarit', optionManuelle: null, modeAudit: 'cache', validation: null},
  { id: 'prises', numero: 'É2', nom: 'Prises', entrant: 'le côté choisi, le téléphone', action: 'la prise, située quand le téléphone le permet', objectif: 'au moins une photo du mur, lisible (une photo illisible se dit, et son échec au redressement)', sortant: 'les photos', optionManuelle: 'ajouter, retirer ou refaire une photo', modeAudit: 'valider', validation: null},
  { id: 'redressement', numero: 'É3', nom: 'Redressement', entrant: 'les photos, les repères posés', action: 'chaque photo redressée entière, par ses repères, sinon par ses points de fuite, sinon par les coins du mur retenu', objectif: 'chaque photo redressée (verticales à 0,5° au plus)', sortant: 'les vues de face, celles que l’assemblage prend', optionManuelle: 'poser quatre repères (un rectangle du mur)', modeAudit: 'cache', validation: null},
  { id: 'assemblage', numero: 'É4', nom: 'Assemblage', entrant: 'les vues de face', action: 'les vues assemblées (ORB et RANSAC de similitude)', objectif: 'toutes les vues assemblées', sortant: 'l’assemblage et ce qu’il montre', optionManuelle: 'retirer une photo, ou en prendre une autre qui recoupe le mur', modeAudit: 'cache', validation: null},
  { id: 'calage', numero: 'É5', nom: 'Calage du mur', entrant: 'l’assemblage, le rapport du plan', action: 'les bouts, l’égout et le sol, par les arêtes puis la teinte du mur, cherchés sans le toit (les angles, l’égout, le sol) ; sur l’assemblage des repères, l’arbitre des poses retient une autre pose qui explique mieux la photo, sinon celle du plan seul, supposée ; la pose retenue jugée sur la silhouette du gabarit qu’elle pose (les angles à ses bouts, l’égout tout le long) ; avec Claude, l’accord de ses deux angles avec elle, mesuré dans le cadre de l’image qu’il a lue (dans l’audit, le mur retenu) ; sa pose n’est jamais candidate ; les coins reportés sur chaque photo', objectif: 'une pose que sa silhouette explique (score d’explication, chaque angle et l’égout au seuil), un mur tiré à la main compris ; des repères ne font que redresser : le mur cherché sur leur assemblage se juge comme un mur trouvé, une pose du plan seul ou un égout ou un sol non lus restent à confirmer ; bouts, égout et sol à 3 % de la largeur contre la vérité', sortant: 'le mur sur l’assemblage', optionManuelle: 'tirer les bouts, l’égout et le sol', modeAudit: 'resume', validation: 'V1'},
  { id: 'silhouette', numero: 'É6', nom: 'Silhouette lue', entrant: 'l’assemblage calé', action: 'le haut du mur lu à la teinte, entre les bouts retenus', objectif: 'la silhouette lue sur au moins la moitié des colonnes (le haut que l’É7 lit) ; le mot de la bande au-dessus de l’égout n’est qu’une information', sortant: 'la silhouette lue', optionManuelle: null, modeAudit: 'cache', validation: null},
  { id: 'diagnostic', numero: 'É7', nom: 'Diagnostic de forme', entrant: 'la silhouette lue, le gabarit, les corps du toit, la lecture de Claude', action: 'les variantes du toit de chaque corps (un pignon de plus, de moins, déplacé, une croupe), faites par le moteur des toits', objectif: 'une proposition n’existe que si elle explique mieux l’image', sortant: 'les propositions de toit, les alertes de hauteur', optionManuelle: 'cocher ou décocher, ouvrir le Mode Toit', modeAudit: 'valider', validation: 'V2'},
  { id: 'texture', numero: 'É8', nom: 'Texture', entrant: 'l’assemblage calé', action: 'l’élévation calée, la fusion des vues, la version sans ombres', objectif: 'une texture posée sur le mur', sortant: 'la texture et la bande au-dessus de l’égout', optionManuelle: 'activer ou non « sans ombres »', modeAudit: 'cache', validation: null},
  { id: 'ouvertures', numero: 'É9', nom: 'Ouvertures', entrant: 'l’assemblage calé, les ouvertures relues (V3)', action: 'la détection, la structure, le vote entre les vues ; les ouvertures trouvées se relisent toujours avant V4', objectif: 'les ouvertures relues par la personne sur cette détection (V3), qui règle aussi les devinées ; rappel, précision et cotes contre la vérité, mesurés à côté', sortant: 'les ouvertures, celles que la personne a gardées', optionManuelle: 'relire les ouvertures : garder, ajouter, retirer, déplacer, redimensionner', modeAudit: 'resume', validation: 'V3'},
  { id: 'toit', numero: 'É10', nom: 'Toit', entrant: 'les propositions du diagnostic (É7), décochées', action: 'les propositions de toit et les éléments (cheminée, lucarne) remis à l’avant/après de l’audit, où le moteur des toits relit sur le corps concerné celles que la personne coche', objectif: 'sautée sans proposition ; sinon à confirmer, ce que le diagnostic propose compté (le moteur en écarte à l’avant/après : un refus, une forme identique), jamais faite ici', sortant: 'les propositions à cocher, le toit ajusté par le moteur une fois cochées', optionManuelle: 'le Mode Toit', modeAudit: 'valider', validation: null},
  { id: 'validation', numero: 'É11', nom: 'Validation', entrant: 'tout ce qui précède', action: 'le bilan de la façade : ses dimensions, sa forme, la pose de sa texture, ses ouvertures', objectif: 'la personne a validé, en une étape d’historique', sortant: 'la Façade écrite (dimensions, forme, texture calée, ouvertures vérifiées)', optionManuelle: 'corriger n’importe quel sortant', modeAudit: 'valider', validation: 'V4'},
];

/**
 * Le nom d'une etape tel que l'orchestrateur et les ecrans le disent, et que le proprietaire l'emploie dans ses demandes : son numero
 * puis son nom (E5 Calage du mur, avec son accent a l'ecran). Le numero est la poignee stable d'une etape : une etape cachee dans l'audit garde le sien.
 */
export function libelleEtape(id: IdEtape): string {
  const e = etapeFacade(id);
  return e.numero + ' ' + e.nom;
}

/** Les numeros des etapes d'un segment de la barre : E5, ou E3-E4 quand il en regroupe plusieurs. */
export function numerosDuSegment(s: Pick<SegmentFacade, 'etapes'>): string {
  const n = s.etapes.map((id) => etapeFacade(id).numero);
  return n.length > 1 ? n[0] + '–' + n[n.length - 1] : n[0] ?? '';
}

/** Le contrat d'une etape. */
export function etapeFacade(id: IdEtape): EtapeFacade {
  const e = ETAPES_FACADE.find((x) => x.id === id);
  if (!e) throw new RangeError('Etape de facade inconnue : ' + id);
  return e;
}

/** Un segment de la barre de progression (§4 ter.5) : des etapes regroupees pour rester lisible. E1, instantanee, n'en a pas. */
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
const GRAVITE: Record<EtatAffiche, number> = { echec: 0, 'a-confirmer': 1, 'en-cours': 2, 'a-venir': 3, confirme: 4, ok: 5, saute: 6 };

/** L'etat d'un segment : le pire de ses etapes ; sautees toutes, il est saute. */
export function etatDuSegment(etats: readonly EtatAffiche[]): EtatAffiche {
  if (!etats.length) return 'a-venir';
  return etats.reduce((pire, e) => (GRAVITE[e] < GRAVITE[pire] ? e : pire));
}

/** L'etat en mots, pour le texte lu a voix haute et la ligne sous la barre. */
export const LIBELLES_ETAT: Record<EtatAffiche, string> = {
  ok: 'faite', confirme: 'confirmé par vous', 'a-confirmer': 'à confirmer', echec: 'en échec', saute: 'sautée', 'a-venir': 'à venir', 'en-cours': 'en cours',
};

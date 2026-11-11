// L'enchainement d'une facade, etape par etape (MD/spec-facade-calage-audit.md §4 ter) : le contrat de chaque etape, comme une
// donnee. Ce que l'automatique fait, l'objectif qui dit qu'il a reussi, ce qui sort, et le geste de repli quand l'objectif n'est
// pas atteint. L'orchestrateur (facade/releve/enchainement.ts) calcule l'etat de chaque etape ; la barre de progression
// (zones/composants/BarreProgressionFacade.tsx) et les ecrans qui la portent ne font que le lire.
//
// L'etat est derive (comme le bilan du redressement) : il se recalcule a chaque rejeu, il n'est jamais enregistre comme verite.
// Le doute du mur se transmet (decision du proprietaire, 3 novembre 2026) : tant que le calage (E7) est a confirmer, les etapes qui lisent
// le mur (E8 a E14) et qui atteignent leur objectif sont a confirmer aussi, « depend du mur a confirmer » ; le mur confirme par la
// personne (V1, « Confirmer le mur », l'etat `confirme`), elles retrouvent leur propre verdict.
// Chaque etape a ses actions typees (code, Claude, la personne, la mesure contre la verite) : un contrat ici, un etat rendu par
// l'orchestrateur seul (decision du proprietaire, 7 novembre 2026).

/**
 * Les etapes, dans l'ordre du tableau §4 ter.2 (E1 a E14, decision du proprietaire du 7 novembre 2026). Les donnees ne portent que
 * l'identifiant, jamais le numero : le numero vient de ETAPES_FACADE et peut changer sans qu'un fichier change.
 */
export type IdEtape =
  | 'preparation' | 'prises' | 'objectif' | 'coins' | 'redressement' | 'assemblage' | 'calage' | 'lectureIa'
  | 'silhouette' | 'diagnostic' | 'texture' | 'ouvertures' | 'toit' | 'validation';

/**
 * L'etat d'une etape calculee : objectif atteint, atteint de justesse (ou deux chemins qui divergent), non atteint, ou inutile ici.
 * Un echec arrete ce qui en depend ; une valeur supposee laisse la suite continuer en le disant (`a-confirmer`).
 * `confirme` : la personne a confirme ce que l'etape a donne (le mur au point V1, « Confirmer le mur ») ; ce n'est pas un `ok` de
 * l'automatique, et les deux se disent autrement (decision du proprietaire, 3 novembre 2026). Seule l'etape du calage le prend aujourd'hui.
 */
export type EtatEtape = 'ok' | 'confirme' | 'a-confirmer' | 'echec' | 'saute';

/** L'etat qu'une etape montre dans la barre : son etat calcule, ou pas encore (a venir, en cours). */
export type EtatAffiche = EtatEtape | 'a-venir' | 'en-cours';

/** Comment l'audit montre une etape (§4 ter.3) : un reglage d'affichage, jamais une propriete de la chaine. La calibration montre tout. */
export type ModeAudit = 'cache' | 'resume' | 'valider';

/** Les quatre points de validation de l'audit (§4 ter.3). */
export type PointValidation = 'V1' | 'V2' | 'V3' | 'V4';

/**
 * Qui fait une action d'une etape : le code de Plan, Claude (un appel rejoue, jamais fait par l'orchestrateur), la personne (un geste),
 * ou une mesure contre la verite d'un cas (en lecture seule : elle ne se fait que si le cas en a une et ne change aucune sortie).
 */
export type TypeAction = 'code' | 'claude' | 'manuel' | 'mesure';

/** Le contrat d'une action (une donnee, comme l'etape) : l'orchestrateur en remplit l'etat, il n'en invente pas. */
export interface ContratAction { id: string; libelle: string; type: TypeAction }

/**
 * Une image d'une etape (facade/releve/imagesEtapes.ts, `ImagesEtapes`) : une reference, jamais les pixels. `photos` : les photos de
 * la prise, telles quelles. Le test de facade/releve/imagesEtapes.ts garde la liste egale aux cles d'ImagesEtapes (plus `photos`).
 */
export type CleImageEtape = 'photos' | 'vues' | 'assemblage' | 'pose' | 'facade' | 'texture' | 'forme' | 'ia';

/** Ce qu'une action lit ou rend : une image deja faite, et/ou des valeurs en clair (jamais une image calculee pour la montrer). */
export interface TraceAction {
  image?: CleImageEtape;
  valeurs?: Readonly<Record<string, string | number | boolean | null>>;
}

/**
 * Un element qu'une action montre un par un : ce que le calcul a trouve, ou une part de la reponse de Claude, et son statut tel que le
 * moteur l'a decide (jamais un avis de plus). `rect` : sa place sur le mur en metres (x depuis le bout gauche, y depuis le sol), ou null
 * (une place en parts du mur va dans `details`, u le long du mur, v en hauteurs d'egout). `vers` : le rang de ce que l'element confirme
 * dans la liste du calcul (l'ouverture calculee d'une boite, la proposition d'un element du toit) ; null : rien.
 * - Les ouvertures (E12) : une boite `retrouvee` (cochee), `devinee-confirmee`, `proposee` (seule, decochee), `ecartee` (hors du mur) ;
 *   une ouverture calculee `confirmee` par une boite, `absente` de sa lecture, ou `devinee`.
 * - Les angles du mur (E7) : `accord`, `divergent` (au-dela de l'ecart admis), `non-situe`.
 * - Les pointes (E9) : `accord`, `hauteur` (vue a une autre hauteur, celle du LiDAR gardee), `en-plus` (le plan n'en a pas), `manquante`.
 * - Les elements du toit (E10) : `retenu` (le diagnostic le propose), `ecarte` (le moteur ne le propose pas).
 * - L'optique d'une photo (E3), rangee avec elle : `lu`, sa focale, son champ et d'ou elle vient (EXIF, appareil, defaut).
 * - Ce qui n'entre dans aucune decision (le mot du haut, le bout, les appentis, les autres volumes, ce qui cache le mur, le parement et
 *   ses zones) : `lu`.
 */
/**
 * Les familles des elements que Claude lit (demande du proprietaire, 7 novembre 2026) : une famille donne a l'ecran sa couleur, la meme
 * a l'E8 et dans l'etape qui montre l'element. `montreeA` : l'etape ou il se montre a cote du calcul ; `consommePar` : les etapes de
 * `derouler` qui le lisent pour decider (vide : une lecture que rien ne consomme encore, montree seulement).
 */
export type FamilleClaude = 'angles' | 'pointe' | 'forme' | 'appentis' | 'corps' | 'element-toit' | 'cache' | 'parement' | 'zone' | 'ouverture';

export const FAMILLES_CLAUDE: Readonly<Record<FamilleClaude, { libelle: string; montreeA: IdEtape; consommePar: readonly IdEtape[] }>> = {
  // Les angles : l'E7 les lit elle-meme et peut prendre la pose de Claude (un choix delibere de l'E7, que « Forcer Claude partout » ne
  // touche pas : decision du proprietaire, 7 novembre 2026).
  angles: { libelle: 'Les deux angles du mur', montreeA: 'calage', consommePar: ['calage'] },
  pointe: { libelle: 'Une pointe du haut', montreeA: 'silhouette', consommePar: ['diagnostic', 'validation'] },
  forme: { libelle: 'Le mot du haut et son bout', montreeA: 'silhouette', consommePar: ['diagnostic'] },
  appentis: { libelle: 'Un appentis', montreeA: 'silhouette', consommePar: [] },
  corps: { libelle: 'Un autre volume', montreeA: 'silhouette', consommePar: ['diagnostic'] },
  'element-toit': { libelle: 'Une cheminée, une lucarne', montreeA: 'diagnostic', consommePar: ['diagnostic'] },
  cache: { libelle: 'Ce qui cache le mur', montreeA: 'texture', consommePar: [] },
  parement: { libelle: 'Le parement', montreeA: 'texture', consommePar: [] },
  zone: { libelle: 'Une zone du parement', montreeA: 'texture', consommePar: [] },
  ouverture: { libelle: 'Une boîte d’ouverture', montreeA: 'ouvertures', consommePar: ['ouvertures', 'validation'] },
};

/** D'ou vient la valeur d'un element : le calcul de l'etape, Claude, ou la personne. */
export type SourceElement = 'calcul' | 'claude' | 'manuel';

/** Une valeur d'element, en clair (une place en parts du mur ou en metres, un type, des details). */
export type ValeurElement = Readonly<Record<string, string | number | boolean | null>>;

/**
 * Le choix de la personne pour un element (un geste, donc une entree de `derouler`, comme les reperes ou le mur confirme) : la source
 * qu'elle retient, et sa valeur manuelle quand elle part d'un calcul ou de Claude pour le corriger. Le type et sa lecture existent ; il
 * ne s'applique encore a aucun calcul (lot C : son rangement dans la capture et le cas, puis son effet etape par etape).
 */
export interface ChoixSource { cle: string; source: SourceElement; valeur?: ValeurElement; le: string }

/**
 * Le forcage de Claude par la personne (demande du proprietaire, 7 novembre 2026) : Claude pour toute une etape (les elements qu'elle
 * montre ou consomme), ou pour toutes les etapes qui consomment une lecture de Claude. Un choix par element l'emporte sur un forcage ;
 * un element que Claude n'a pas lu garde le calcul, et le dit (`sansClaude`). Par defaut rien n'est force. Type et lecture seulement :
 * il ne s'applique encore a aucun calcul (lot C).
 */
export type ForcageSource = { etape: IdEtape; source: 'claude'; le: string } | { toutes: true; source: 'claude'; le: string };

export interface ElementAction {
  /** L'identifiant stable de l'element dans la reponse de Claude (`pointe:2`, `ouverture:0`…) ; absent d'un element du seul calcul. */
  cle?: string;
  famille?: FamilleClaude;
  /** Les etapes qui le consomment (`FAMILLES_CLAUDE`), recopiees pour la lecture. */
  consommePar?: readonly IdEtape[];
  /** Ses trois valeurs possibles : celle du calcul, celle de Claude, celle de la personne (null : il n'y en a pas). */
  valeurs?: { calcul: ValeurElement | null; claude: ValeurElement | null; manuel: ValeurElement | null };
  /** La source que le moteur retient aujourd'hui, la valeur par defaut (null : aucune, une lecture qui n'entre dans rien). */
  retenue?: SourceElement | null;
  /** Le choix de la personne, lu dans les entrees (`EntreesFacade.choix`) ; null : aucun, la valeur par defaut vaut. */
  choisie?: ChoixSource | null;
  /** Le forcage de Claude qui vise cet element (`EntreesFacade.forcages`) ; null : aucun. */
  forcee?: ForcageSource | null;
  /**
   * La source qui vaudrait, lue dans cet ordre : le choix de l'element, sinon le forcage (Claude, ou le calcul quand Claude ne l'a pas lu),
   * sinon celle que retient le moteur. Une lecture : le calcul ne l'applique pas encore (lot C).
   */
  sourceLue?: SourceElement | null;
  /** Vrai : un forcage de Claude vise cet element, mais Claude ne l'a pas lu ; le calcul est garde. */
  sansClaude?: boolean;
  genre: 'ouverture' | 'boite' | 'pose' | 'pointe' | 'forme' | 'etendue' | 'element' | 'parement' | 'zone' | 'cache' | 'optique';
  statut: 'retrouvee' | 'devinee-confirmee' | 'proposee' | 'ecartee' | 'confirmee' | 'absente' | 'devinee'
    | 'accord' | 'divergent' | 'non-situe' | 'hauteur' | 'en-plus' | 'manquante' | 'retenu' | 'ecarte' | 'lu';
  type: string;
  rect: { x: number; y: number; l: number; h: number } | null;
  /** Ce que la boite (ou l'ouverture) dit en plus : volets, allege, forme, et pour une boite sa confiance. */
  details?: Readonly<Record<string, string | number | boolean | null>>;
  /** La division du vitrage que Claude lit (vantaux, colonnes, rangees, petits bois, imposte, vitrage), telle quelle. */
  carreaux?: Readonly<Record<string, unknown>> | null;
  vers?: number | null;
}

/** Les appels de Claude qu'une etape rejoue : le run de la facade, sa lecture enrichie (lot L1), le toit lu (lot L2). */
export type AppelClaude = 'run' | 'enrichie' | 'toit';

/**
 * Une action d'une etape calculee, telle que `derouler` la rend (et nulle part ailleurs) : son contrat, son etat, ce qu'elle a dit,
 * ce qu'elle a lu et rendu. Une action `claude` d'une etape est la part de la reponse rejouee que cette etape concerne, a cote du calcul
 * de l'etape, avec le statut que le moteur lui a donne ; l'E8 garde la vue d'ensemble de la reponse (et l'image envoyee).
 *
 * ce qu'elle a lu et rendu. `claude` : l'appel concerne, rejoue depuis la reponse enregistree (`rejouee`), et l'image qu'il a lue
 * (l'assemblage en calibration, l'image du run dans l'audit : l'exception acceptee de CLAUDE.md, dite et jamais corrigee).
 * `manuel` : le geste, et s'il a ete fait (null : le processus ne le voit pas, un geste fait ailleurs, une photo retiree).
 */
export interface ActionEtape extends ContratAction {
  etat: EtatEtape;
  texte?: string;
  avant?: TraceAction;
  apres?: TraceAction;
  claude?: { appel: AppelClaude; rejouee: boolean; image: 'assemblage' | 'imageRun' | null };
  manuel?: { geste: string; fait: boolean | null };
  /** Les elements, un par un (les ouvertures calculees, les boites de Claude de l'E12). */
  elements?: readonly ElementAction[];
}

/** Le contrat d'une etape (§4 ter.1). Des phrases pour les personnes ; les objectifs chiffres sont des reglages (regles/facades/enchainement.json). */
export interface EtapeFacade {
  id: IdEtape;
  /** E1 a E14, comme la spec les nomme. */
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
  /** Les actions de l'etape, typees (code, Claude, la personne, la mesure contre la verite) ; `derouler` en rend l'etat. */
  actions: readonly ContratAction[];
}

const code = (id: string, libelle: string): ContratAction => ({ id, libelle, type: 'code' });
const claude = (id: string, libelle: string): ContratAction => ({ id, libelle, type: 'claude' });
const manuel = (id: string, libelle: string): ContratAction => ({ id, libelle, type: 'manuel' });
/** La mesure contre la verite d'un cas : en lecture seule, seulement quand le cas en a une. */
const VERITE: ContratAction = { id: 'verite', libelle: 'Contre la vérité du cas', type: 'mesure' };

export const ETAPES_FACADE: readonly EtapeFacade[] = [
  { id: 'preparation', numero: 'É1', nom: 'Préparation', entrant: 'le contour, les corps du toit, le LiDAR, le cadastre', action: 'les dimensions, le gabarit, le rapport hauteur sur largeur, les pointes attendues', objectif: 'un gabarit existe (un rectangle sinon)', sortant: 'les dimensions et le gabarit', optionManuelle: null, modeAudit: 'cache', validation: null,
    actions: [code('gabarit', 'Dimensions et gabarit du plan')] },
  { id: 'prises', numero: 'É2', nom: 'Prises', entrant: 'le côté choisi, le téléphone', action: 'la prise, située quand le téléphone le permet', objectif: 'au moins une photo du mur, lisible (une photo illisible se dit, et son échec au redressement)', sortant: 'les photos', optionManuelle: 'ajouter, retirer ou refaire une photo', modeAudit: 'valider', validation: null,
    actions: [manuel('prendre', 'Prendre les photos du mur')] },
  { id: 'objectif', numero: 'É3', nom: 'Objectif', entrant: 'les photos et leur EXIF', action: 'le champ de chaque photo : l’EXIF, sinon lu sur ses points de fuite, sinon noté pour l’appareil, sinon supposé', objectif: 'chaque photo a un champ ; sans EXIF, la photo le dit (le redressement par les points de fuite peut être faux)', sortant: 'le champ de chaque photo', optionManuelle: 'poser quatre repères, qui ne dépendent pas de la focale', modeAudit: 'cache', validation: null,
    actions: [code('champ', 'Champ de chaque photo (EXIF, points de fuite, supposé)')] },
  { id: 'coins', numero: 'É4', nom: 'Coins du mur', entrant: 'les photos, leur prise de vue, les coins posés au doigt', action: 'les coins du mur sur chaque photo : posés au doigt, sinon trouvés sur les arêtes, sinon reportés, sinon prédits par la prise de vue', objectif: 'chaque photo a quatre coins (prédits, ils restent à vérifier : l’étape du calage juge le mur)', sortant: 'les coins de chaque photo et leur origine', optionManuelle: 'poser les coins au doigt', modeAudit: 'cache', validation: null,
    actions: [code('coins', 'Coins sur chaque photo'), manuel('poser', 'Coins posés au doigt')] },
  { id: 'redressement', numero: 'É5', nom: 'Redressement', entrant: 'les photos, leur champ, leurs coins, les repères posés', action: 'chaque photo redressée entière, par ses repères, sinon par ses points de fuite, sinon par les coins du mur retenu', objectif: 'chaque photo redressée (verticales à 0,5° au plus)', sortant: 'les vues de face, celles que l’assemblage prend', optionManuelle: 'poser quatre repères (un rectangle du mur)', modeAudit: 'cache', validation: null,
    actions: [code('redresser', 'Photos redressées entières'), manuel('reperes', 'Quatre repères posés')] },
  { id: 'assemblage', numero: 'É6', nom: 'Assemblage', entrant: 'les vues de face', action: 'les vues assemblées (ORB et RANSAC de similitude)', objectif: 'toutes les vues assemblées', sortant: 'l’assemblage et ce qu’il montre', optionManuelle: 'retirer une photo, ou en prendre une autre qui recoupe le mur', modeAudit: 'cache', validation: null,
    actions: [code('assembler', 'Vues assemblées'), manuel('retirer', 'Retirer une photo')] },
  { id: 'calage', numero: 'É7', nom: 'Calage du mur', entrant: 'l’assemblage, le rapport du plan', action: 'les bouts, l’égout et le sol, par les arêtes puis la teinte du mur, cherchés sans le toit (les angles, l’égout, le sol) ; sur l’assemblage des repères, l’arbitre des poses retient une autre pose qui explique mieux la photo, sinon celle du plan seul, supposée ; sans geste, quand le gabarit a des pignons et que l’assemblage les montre tous, le mur posé par eux (bouts par leurs sommets, égout et sol lus sous eux) ; la pose retenue jugée sur la silhouette du gabarit qu’elle pose (les angles à ses bouts, l’égout tout le long) ; les coins reportés sur chaque photo', objectif: 'une pose que sa silhouette explique (score d’explication, chaque angle et l’égout au seuil), un mur tiré à la main compris ; des repères ne font que redresser : le mur cherché sur leur assemblage se juge comme un mur trouvé, une pose du plan seul ou un égout ou un sol non lus restent à confirmer ; bouts, égout et sol à 3 % de la largeur contre la vérité', sortant: 'le mur sur l’assemblage', optionManuelle: 'tirer les bouts, l’égout et le sol', modeAudit: 'resume', validation: 'V1',
    actions: [code('chercher', 'Mur cherché sur l’assemblage'), code('analyser', 'Mur posé analysé : redressé à l’échelle du plan, vues fondues, haut lu, détection, texture'), code('juger', 'Pose jugée sur la silhouette du gabarit'), claude('angles', 'Les deux angles du mur selon Claude (jamais candidats)'), manuel('tirer', 'Bouts, égout et sol tirés à la main'), manuel('confirmer', 'Confirmer le mur (V1)'), VERITE] },
  { id: 'lectureIa', numero: 'É8', nom: 'Lecture de Claude', entrant: 'la réponse enregistrée de Claude (le run de la façade, sa lecture enrichie, le toit lu), le mur retenu, l’analyse du mur', action: 'la réponse rejouée, sans réseau ni coût : l’accord de ses deux angles avec la pose retenue (dans le cadre de l’image qu’il a lue), ses pointes contre le gabarit, ses boîtes accordées avec la détection ; sa pose n’est jamais candidate', objectif: 'une passe lisible, ses angles d’accord avec le mur retenu (3 % de la largeur) ; sautée sans réponse (mode déterministe)', sortant: 'la lecture de Claude : son accord, ses pointes, ses boîtes cochées ou seules', optionManuelle: null, modeAudit: 'resume', validation: null,
    actions: [claude('run', 'Run de la façade'), claude('enrichie', 'Lecture enrichie'), claude('toit', 'Lecture du toit'), code('angles', 'Accord de ses angles avec le mur retenu'), code('pointes', 'Ses pointes contre le gabarit'), code('boites', 'Ses boîtes accordées avec la détection'), VERITE] },
  { id: 'silhouette', numero: 'É9', nom: 'Silhouette lue', entrant: 'l’assemblage calé', action: 'le haut du mur lu à la teinte, entre les bouts retenus', objectif: 'la silhouette lue sur au moins la moitié des colonnes (le haut que le diagnostic lit) ; le mot de la bande au-dessus de l’égout n’est qu’une information', sortant: 'la silhouette lue', optionManuelle: null, modeAudit: 'cache', validation: null,
    actions: [code('lire', 'Haut du mur lu à la teinte'), claude('forme', 'Le haut selon Claude : le mot, le bout, les pointes, les appentis, les autres volumes')] },
  { id: 'diagnostic', numero: 'É10', nom: 'Diagnostic de forme', entrant: 'la silhouette lue, le gabarit, les corps du toit, la lecture de Claude', action: 'les variantes du toit de chaque corps (un pignon de plus, de moins, déplacé, une croupe), faites par le moteur des toits', objectif: 'une proposition n’existe que si elle explique mieux l’image', sortant: 'les propositions de toit, les alertes de hauteur', optionManuelle: null, modeAudit: 'cache', validation: null,
    actions: [code('diagnostiquer', 'Variantes du toit de chaque corps'), claude('elements', 'Les éléments du toit que Claude voit (cheminée, lucarne)'), VERITE] },
  { id: 'texture', numero: 'É11', nom: 'Texture', entrant: 'l’assemblage calé', action: 'l’élévation calée, la fusion des vues, la version sans ombres', objectif: 'une texture posée sur le mur', sortant: 'la texture et la bande au-dessus de l’égout', optionManuelle: 'activer ou non « sans ombres »', modeAudit: 'cache', validation: null,
    actions: [code('texture', 'Texture calée sur le mur'), claude('surface', 'Le parement et ses zones selon Claude'), claude('cache', 'Ce qui cache le mur selon Claude (arbre, haie, voiture)'), code('sansOmbres', 'Texture sans ombres (pour l’écran)'), manuel('activerSansOmbres', 'Activer ou non « sans ombres »')] },
  { id: 'ouvertures', numero: 'É12', nom: 'Ouvertures', entrant: 'l’assemblage calé, les ouvertures relues (V3)', action: 'la détection, la structure, le vote entre les vues ; les ouvertures trouvées se relisent toujours avant V4', objectif: 'les ouvertures relues par la personne sur cette détection (V3), qui règle aussi les devinées ; rappel, précision et cotes contre la vérité, mesurés à côté', sortant: 'les ouvertures, celles que la personne a gardées', optionManuelle: 'relire les ouvertures : garder, ajouter, retirer, déplacer, redimensionner', modeAudit: 'resume', validation: 'V3',
    actions: [code('detecter', 'Ouvertures calculées : détection, structure et vote entre les vues'), claude('boites', 'Boîtes de Claude : retrouvées, seulement proposées, écartées'), code('voisins', 'Ouvertures sous le pignon d’un corps voisin'), manuel('relire', 'Relire les ouvertures (V3) : ajuster une ouverture calculée, prendre ou ajuster une boîte de Claude, en ajouter une'), VERITE] },
  { id: 'toit', numero: 'É13', nom: 'Toit', entrant: 'les propositions du diagnostic, décochées', action: 'les propositions de toit et les éléments (cheminée, lucarne) remis à l’avant/après de l’audit, où le moteur des toits relit sur le corps concerné celles que la personne coche', objectif: 'sautée sans proposition ; sinon à confirmer, ce que le diagnostic propose compté (le moteur en écarte à l’avant/après : un refus, une forme identique), jamais faite ici', sortant: 'les propositions à cocher, le toit ajusté par le moteur une fois cochées', optionManuelle: 'cocher ou décocher les propositions à l’avant/après, ouvrir le Mode Toit', modeAudit: 'valider', validation: 'V2',
    actions: [manuel('cocher', 'Cocher ou décocher les propositions à l’avant/après de l’audit (V2)')] },
  { id: 'validation', numero: 'É14', nom: 'Validation', entrant: 'tout ce qui précède', action: 'le bilan de la façade : ses dimensions, sa forme, la pose de sa texture, ses ouvertures', objectif: 'la personne a validé, en une étape d’historique', sortant: 'la Façade écrite (dimensions, forme, texture calée, ouvertures vérifiées)', optionManuelle: 'corriger n’importe quel sortant', modeAudit: 'valider', validation: 'V4',
    actions: [code('bilan', 'Bilan de la façade'), manuel('valider', 'Valider la façade (V4)')] },
];

/**
 * Les anciens numeros (E1 a E11, jusqu'au 7 novembre 2026) et l'etape qu'ils designaient : pour relire une demande, un texte ou une PR
 * d'avant. Les donnees ne portaient jamais de numero : rien a migrer.
 */
export const ANCIENS_NUMEROS: Readonly<Record<string, IdEtape>> = {
  'É1': 'preparation', 'É2': 'prises', 'É3': 'redressement', 'É4': 'assemblage', 'É5': 'calage', 'É6': 'silhouette',
  'É7': 'diagnostic', 'É8': 'texture', 'É9': 'ouvertures', 'É10': 'toit', 'É11': 'validation',
};

/** Le contrat d'une action d'une etape. */
export function actionDe(id: IdEtape, action: string, type?: TypeAction): ContratAction {
  const a = etapeFacade(id).actions.find((x) => x.id === action && (!type || x.type === type));
  if (!a) throw new RangeError('Action inconnue : ' + id + '.' + action);
  return a;
}

/**
 * Le nom d'une etape tel que l'orchestrateur et les ecrans le disent, et que le proprietaire l'emploie dans ses demandes : son numero
 * puis son nom (E7 Calage du mur, avec son accent a l'ecran). Le numero est la poignee stable d'une etape : une etape cachee dans l'audit garde le sien.
 */
export function libelleEtape(id: IdEtape): string {
  const e = etapeFacade(id);
  return e.numero + ' ' + e.nom;
}

/** Les numeros des etapes d'un segment de la barre : E2, ou E3-E6 quand il en regroupe plusieurs. */
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
  { numero: 2, nom: 'Image', etapes: ['objectif', 'coins', 'redressement', 'assemblage'], validation: null },
  { numero: 3, nom: 'Mur', etapes: ['calage', 'lectureIa'], validation: 'V1' },
  // V2 est a l'E13 (decision du proprietaire, 7 novembre 2026) : la coche se fait la, a l'avant/apres ; l'E10 est un diagnostic pur.
  { numero: 4, nom: 'Forme', etapes: ['silhouette', 'diagnostic'], validation: null },
  { numero: 5, nom: 'Texture', etapes: ['texture'], validation: null },
  { numero: 6, nom: 'Ouvertures', etapes: ['ouvertures'], validation: 'V3' },
  { numero: 7, nom: 'Toit', etapes: ['toit'], validation: 'V2' },
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

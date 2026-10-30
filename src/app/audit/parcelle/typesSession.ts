// Ce que la session de l'audit de la parcelle (controleur.ts) demande au reste du programme et ce qu'elle offre a l'ecran : seuls,
// pour que ses parties (capteurs, brouillon, etapes, visee, vue) ne dependent pas de la session qui les assemble.

import { suivrePositionGps } from '../../../shell/geolocalisation.js';
import { autoriserBoussole, suivreBoussole } from '../../../shell/boussole.js';
import type { DialogueChoix } from '../../../shell/dialogues.js';
import type { StockageBrouillon } from '../../../io/brouillonAudit.js';
import type { EnvoiCorpus } from '../../../model/auditParcelle.js';
import type { CacheVue, VuePieton } from './vuePrise.js';
import type { CaptureEnCours } from './capture.js';
import type { ListeDeControle } from './liste.js';
import type { ProjetAudit, Validation } from './validation.js';
import type { Corpus } from './corpus.js';
import type { DependancesSauvegarde, Sauvegarde } from './sauvegarde.js';
import type { EntreesEcriture } from './fichier.js';
import type { FichierAuditParcelle } from '../../../model/fichierAuditParcelle.js';
import { partagerFichier } from '../../../shell/partage.js';
import type { AnalyseClaude, ContexteAnalyse } from './analyseClaude.js';
import type { IdentiteAnalyse } from './entreesAnalyse.js';
import type { DependancesMesures } from './mesures.js';
import type { ClientAudits } from '../../../io/auditsServeur.js';
import type { Facade } from '../../../geometry/cotesVusDeDehors.js';
import type { PhotoCas, PrisePhoto } from '../../../model/audit.js';
import type { EtatApp } from '../../../core/state.js';
import type { PtBrut } from '../../../model/types.js';
import type { IdEtape } from '../../../model/etapeFacade.js';

export interface ContexteAuditParcelle {
  etat: EtatApp;
  idu: string;
  ouvrir3d: () => void;
  signaler: (message: string) => void;
  suivre?: typeof suivrePositionGps;
  boussole?: { suivre: typeof suivreBoussole; autoriser: typeof autoriserBoussole };
  /** Ou se range le brouillon ; par defaut IndexedDB, `null` pour ne rien garder. */
  stockage?: StockageBrouillon | null;
  delaiBrouillonMs?: number;
  questionner?: (d: DialogueChoix) => void;
  /** La facade visee, dans sa teinte : rouge a photographier, vert deja photographiee. */
  surligner?: (f: Facade | null, teinte: number) => void;
  /** Les facades deja photographiees, en vert pendant la prise ; une liste vide les retire. */
  surlignerFaites?: (murs: Facade[]) => void;
  /** La camera a hauteur d'homme de l'ecran de prise ; par defaut celle de la Vue 3D ouverte. */
  vue?: VuePieton;
  /**
   * La vue epuree pendant l'audit (le batiment audite et le sol) : `garder` dit quels objets restent,
   * `null` rend tout ; par defaut la Vue 3D ouverte (three/scene.ts).
   */
  epurer?: (garder: ((cle: string) => boolean) | null) => void;
  /**
   * Le trait renforce de pres (three/traitDePres.ts) : les aretes du batiment `cle`, a cette force
   * (0 a 1) ; `null` le retire. Par defaut la Vue 3D ouverte.
   */
  trait?: (cle: string | null, force: number) => void;
  /** Ce que le doigt touche dans la Vue 3D (cle de l'objet et point du plan) ; par defaut la scene ouverte. */
  objetSous?: (ndc: { x: number; y: number }, retenir: (cle: string) => boolean) => { cle: string | null; point: PtBrut | null };
  horloge?: () => number;
  poserPosition?: (p: PtBrut, precisionM: number) => void;
  retirerPosition?: () => void;
  maintenant?: () => Date;
  /** L'historique, le rendu et la Vue 3D, pour valider les propositions (§14) ; absent dans les tests de la capture. */
  projet?: ProjetAudit;
  /** Ce que les mesures des facades demandent (§13.1) ; par defaut, le worker du releve et le canevas. */
  mesures?: DependancesMesures;
  /** Le client des routes `admin/audits` (partage pour le corpus, §15) ; null ou absent : rien ne part. */
  audits?: () => ClientAudits | null;
  /** L'administrateur ecrit toujours le fichier de l'audit (§15) ; un utilisateur le partage par la case. */
  admin?: () => boolean;
  /** La sauvegarde sur le serveur pendant la capture (§15) : delais et horloge, pour les tests. */
  sauvegarde?: Partial<Pick<DependancesSauvegarde, 'delaiMs' | 'reessaisMs' | 'tailleMax' | 'planifier' | 'surReseau'>>;
  partager?: typeof partagerFichier;
  lireGrille?: EntreesEcriture['lireGrille'];
  /**
   * L'analyse par Claude (§13.2, lot L17) : le client des routes du serveur (null hors plateforme et
   * hors admin), l'identite de la parcelle pour le journal, et ce qui dessine les images (par defaut
   * le navigateur). Absente dans les tests de la capture : l'analyse est alors indisponible.
   */
  analyse?: Pick<ContexteAnalyse, 'client'> & { identite?: () => Omit<IdentiteAnalyse, 'audit'> } & Partial<Pick<ContexteAnalyse, 'images' | 'jardin' | 'notifier' | 'preparerNotification' | 'memoire' | 'delaiSuiviMs' | 'planifier' | 'accorder' | 'essai'>>;
}

/** `propositions` : la phase 3, posee sur la Vue 3D comme l'ecran de prise (§14). */
export type EcranAudit = 'liste' | 'prise' | 'propositions';
export type EtatPosition = 'attente' | 'refusee' | 'horsPlan' | 'ok';

/** La facade ou la prochaine photo se rangera, et comment on la connait. */
export interface CibleFacade {
  cle: string;
  cote: number;
  facade: Facade;
  /** « la façade sud de Maison » */
  nom: string;
  /** La distance au mur, quand la position la donne. */
  distance: number | null;
  /** Choisie dans la liste ou touchee dans la 3D, plutot que reconnue. */
  choisie: boolean;
  photos: number;
  /** « Une photo suffit », « 3 photos, de gauche à droite » (§12.2), avec le gros plan du parement. */
  plan: string | null;
}

export interface SessionAuditParcelle {
  readonly capture: CaptureEnCours;
  /** Les mesures devenues propositions, et leur validation (phases 2 et 3, §13.1 et §14). */
  readonly validation: Validation;
  /** L'analyse par Claude (§13.2) : accord, envoi, suivi, resultats. */
  readonly analyse: AnalyseClaude;
  /** « Partager cet audit pour améliorer Plan » (§15, decision D7). */
  readonly corpus: Corpus;
  /** La sauvegarde sur le serveur de Plan, pendant la capture (§15) : « Envoyer l'audit au serveur ». */
  readonly sauvegarde: Sauvegarde;
  /** Le fichier de l'audit, tel qu'il se partage (§15). */
  fichier(): Promise<FichierAuditParcelle>;
  /** L'administrateur ecrit le fichier de l'audit (un audit fait pour un client, §15). */
  fichierDisponible(): boolean;
  partagerLeFichier(): Promise<void>;
  /**
   * Reprend un fichier d'audit de cette parcelle la ou il en etait : a la phase 3 (sa capture, ses
   * mesures et ses cases) si la capture etait terminee, sur la liste de controle sinon. Une capture
   * en cours sur l'appareil n'est remplacee qu'apres confirmation ; `pret` ensuite. `depot` : le
   * depot du serveur d'ou vient le fichier (catalogue de l'administrateur), que la sauvegarde
   * remplacera desormais au lieu d'en creer un autre. `remesurer` : les mesures et les decisions du fichier ne sont pas
   * reprises, ses photos repassent par les mesures d'aujourd'hui (Admin › Audits, « Relancer l'analyse des photos »).
   */
  importer(f: FichierAuditParcelle, pret: () => void, depot?: EnvoiCorpus, remesurer?: boolean): Promise<void>;
  /**
   * Consultation d'un audit recu (Admin › Audits) : cette session, a part de celle de l'audit en
   * cours, ne montre que les propositions du fichier et ce qui en a ete decide, sur le meme ecran et
   * la meme Vue 3D avant / apres. Rien ne se mesure, ne se partage ni ne s'ecrit dans le projet.
   */
  consulter(f: FichierAuditParcelle, pret: () => void): void;
  /** Vrai pour une consultation : l'ecran des propositions ne laisse rien cocher ni valider. */
  lectureSeule(): boolean;
  liste(): ListeDeControle;
  ecran(): EcranAudit;
  montrer(e: EcranAudit): void;
  cible(): CibleFacade | null;
  position(): { etat: EtatPosition; precisionM: number | null; boussole: boolean };
  /** Ou vous etes et vers ou pointe le telephone, pour la photo. */
  prise(): PrisePhoto | null;
  /** Depuis la liste : la prochaine photo ira sur cette facade, et l'ecran de prise s'ouvre. */
  photographier(cle: string, cote: number): void;
  /** Revient a la facade reconnue par la position. */
  suivreLaPosition(): void;
  /**
   * Le batiment verrouille pour la prise, ou null (§12.2). La parcelle porte parfois une annexe a
   * cote de la maison : la personne choisit « ce batiment-ci » et la prise ne vise plus que lui.
   */
  verrou(): string | null;
  /** Verrouille ce batiment, ou rend la main (`null`) : c'est un geste volontaire, jamais deduit. */
  verrouiller(cle: string | null): void;
  /** « Ce n'est pas cette façade » : la suivante parmi celles devant vous. */
  pasCetteFacade(): void;
  /** Le doigt touche la Vue 3D pendant la prise : la facade touchee devient celle de la prochaine photo. */
  toucher(ndc: { x: number; y: number }): void;
  /** Un doigt fait tourner la Vue 3D : elle reste ou il l'a mise un moment avant de reprendre le suivi. */
  lacherVue(): void;
  /** Une scene vient d'etre batie : la camera de la prise, ou l'apercu des propositions, s'y repose. */
  sceneBatie(): void;
  /**
   * Le coin haut gauche de l'ecran de prise ou des propositions, en pixels de la fenetre (null : rien
   * ne cache la vue) : la Vue 3D cadre ce qu'il laisse voir, au-dessus ou a gauche.
   */
  cadrerVue(cache: CacheVue | null): void;
  /** Range la photo sur la facade visee ; null s'il n'y en a pas (ou plus de place). */
  rangerPhoto(photo: PhotoCas): { cle: string; cote: number } | null;
  /** La phrase de la derniere photo rangee : « Photo rangée sur la façade sud de Maison (2 photos). » */
  dernierRangement(): string | null;
  /**
   * L'etape ouverte dans la barre de progression d'une facade (`cle#cote`), par la commande `facade.etape` : son resultat et son
   * option manuelle s'ecrivent sous la barre. Null : aucune.
   */
  etapeOuverte(): { facade: string; etape: IdEtape } | null;
  ouvrirEtape(facade: string, etape: IdEtape | null): void;
  lancerAnalyse(): void;
  /** Les capteurs s'arretent (l'ecran est ferme) ; `reprendre` les relance. */
  suspendre(): void;
  reprendre(): void;
  /** Demande la boussole (Safari) : a appeler dans le geste qui ouvre l'audit. */
  autoriserBoussole(): void;
  /** Le brouillon, tout de suite : l'ecran se verrouille, l'onglet passe en arriere-plan. */
  ecrireBrouillon(): Promise<boolean>;
  /** A l'ouverture : propose de reprendre le brouillon de cette parcelle, puis appelle `pret`. */
  proposerReprise(pret: () => void): Promise<void>;
  abonner(f: () => void): () => void;
}

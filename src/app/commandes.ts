// Le registre des commandes : ce que l'utilisateur peut demander, nomme une fois (spec-ihm-zones §5.2).
//
// Jusqu'ici chaque bouton etait un `addEventListener` sur un id d'`index.html`, et la seule liste de
// ce que l'application sait faire etait le balisage lui-meme. Le registre inverse cela : une
// commande a un identifiant stable (`objet.dupliquer`), un libelle, un groupe, parfois un raccourci
// et une condition d'activation ; le bouton n'est plus qu'une liaison vers elle. C'est ce que les
// zones de la nouvelle interface (palette, menus, raccourcis clavier) consommeront, et c'est ce qui
// interdit qu'un meme geste existe a deux endroits sous deux noms.
//
// Etape 0 de la reconstruction : le registre existe et tous les boutons passent par lui, mais
// l'ecran ne change pas. Les cases a cocher et curseurs (`change`, `input`) restent des reglages
// lies a l'etat ; ils rejoindront le magasin zone par zone.

export type GroupeCommande =
  | 'projet' | 'fichier' | 'export' | 'objet' | 'vue' | 'affichage' | 'mesure' | 'terrasse'
  | '3d' | 'visionneuse' | 'cloture' | 'plu' | 'facade';

/**
 * Ce que la plateforme accorde, vu du registre.
 *
 * Injecte plutot que lu : sans plateforme branchee, tout est permis, parce que Plan est alors seul
 * et qu'il n'y a personne a qui demander. Le jour ou une plateforme est la, c'est elle qui repond,
 * et le registre ne fait que relayer.
 */
export interface Droits {
  /** Une plateforme repond-elle ? Faux : le registre laisse tout passer. */
  branchee(): boolean;
  /** L'organisation a-t-elle achete cette fonction ? */
  aCapacite(code: string): boolean;
  /** Cette personne a-t-elle ce droit ? */
  aPermission(code: string): boolean;
  /** Ce qu'il reste d'un quota, ou rien quand ce n'en est pas un. */
  reste(feature: string): number | null;
  /** La phrase a dire quand ce quota est atteint ; absente : la phrase generale. */
  phraseQuota?(feature: string): string;
}

/** Tout est permis : la forme que prend l'absence de plateforme. */
export const DROITS_OUVERTS: Droits = {
  branchee: () => false,
  aCapacite: () => true,
  aPermission: () => true,
  reste: () => null
};

/**
 * Ce que l'ecran doit faire d'une commande.
 *
 * Trois refus, et ils ne se montrent pas pareil (spec-connexion-plateforme §4.2) :
 * une capacite non achetee **efface** la commande, parce qu'un outil de travail n'est pas une
 * publicite ; une permission manquante ou un quota epuise la **laissent visible et s'expliquent**,
 * parce que la personne peut y faire quelque chose — demander a un administrateur, ou attendre que
 * la periode tourne.
 */
export type EtatCommande =
  | { utilisable: true }
  | { utilisable: false; raison: 'inconnue' | 'contexte' }
  | { utilisable: false; raison: 'capacite' | 'permission' | 'quota'; message: string };

export const PHRASE_PERMISSION = "Un administrateur de votre organisation peut vous donner ce droit.";
export const PHRASE_CAPACITE = "Cette fonction n'est pas comprise dans l'abonnement de votre organisation.";
export const PHRASE_QUOTA = "Votre organisation a atteint ce que son abonnement prevoit.";

/**
 * Ce sur quoi porte une commande parametree : l'objet du plan, la cote, et une valeur quand le geste
 * en demande une (l'etiquette a basculer, l'extremite choisie). Les cles sont celles du projet.
 */
export interface Cible { objet?: string; cote?: string; valeur?: string }

export interface Commande {
  /** Stable, en `groupe.action` : c'est lui que les menus, la palette et les raccourcis citent. */
  id: string;
  libelle: string;
  groupe: GroupeCommande;
  /** Presentation seulement : le registre n'ecoute pas le clavier, `core/historique.ts` le fait. */
  raccourci?: string;
  description?: string;
  /** Absente : toujours active. */
  actif?: () => boolean;
  /** La fonction que l'organisation doit avoir achetee. Absente : offerte avec le produit. */
  capacite?: string;
  /** Le droit que la personne doit tenir. Absente : aucun droit particulier. */
  permission?: string;
  /**
   * Le quota que la commande consomme. Absente : elle n'en consomme aucun. Une fonction quand cela
   * depend du moment : remplir un projet neuf n'en cree pas un de plus (elle rend alors `null`).
   */
  quota?: string | (() => string | null);
  /**
   * La commande porte sur un objet ou sur une cote : elle n'agit qu'avec cette cible, et le registre
   * la refuse sans elle. Absente : la commande s'execute telle quelle.
   */
  parametre?: 'objet' | 'cote';
  /**
   * Classement, sans effet sur l'execution (MD/spec-demos-admin.md, « Ecritures a surveiller ») :
   * une commande SANS permission qui ecrit pourtant dans le projet le declare. `projet` : une donnee
   * du projet ; `affichage` : une preference d'affichage enregistree avec le projet. Une commande qui
   * porte la permission d'ecriture n'a pas besoin de le dire.
   */
  ecrit?: 'projet' | 'affichage';
  /**
   * `source` est l'element qui a declenche la commande, pour celles qui changent son etat ; `cible`,
   * ce sur quoi porte une commande parametree.
   */
  executer: (source?: HTMLElement, cible?: Cible) => void;
}

export interface RegistreCommandes {
  /** Refuse un identifiant deja pris : deux boutons pour un geste, c'est une commande et deux liaisons. */
  declarer(commande: Commande): void;
  /** Rend `false` si la commande est inconnue, inactive, ou parametree et sans sa cible ; ne leve jamais. */
  executer(id: string, source?: HTMLElement, cible?: Cible): boolean;
  obtenir(id: string): Commande | undefined;
  /** Ce que l'ecran doit faire de cette commande : l'activer, l'effacer, ou l'expliquer. */
  etat(id: string): EtatCommande;
  /** Vrai quand la commande doit disparaitre plutot que d'etre grisee. */
  effacee(id: string): boolean;
  lister(groupe?: GroupeCommande): Commande[];
}

/**
 * Les boutons sont des zones React (zones/) qui appellent `executer` avec leur element en source : le
 * registre ne cherche plus rien dans la page.
 */
export function creerRegistre(droits: Droits = DROITS_OUVERTS, surRefusQuota?: (id: string, message: string) => void): RegistreCommandes {
  const commandes = new Map<string, Commande>();
  const registre: RegistreCommandes = {
    declarer(c) {
      if (commandes.has(c.id)) throw new Error('Commande deja declaree : ' + c.id);
      commandes.set(c.id, c);
    },
    executer(id, source, cible) {
      const c = commandes.get(id);
      // On n'envoie pas une commande qu'on sait refusee. Ce n'est pas la securite — la plateforme
      // refuse pour de bon sur ses propres routes — c'est la politesse : un aller-retour pour se
      // faire dire non est un aller-retour de trop.
      if (!c) return false;
      const e = registre.etat(id);
      if (!e.utilisable) {
        // Un quota atteint se dit, au geste meme : la personne a clique pour creer, elle doit savoir
        // pourquoi rien ne se cree — une info-bulle ne se voit pas sur un ecran tactile.
        if (e.raison === 'quota' && surRefusQuota) surRefusQuota(id, e.message);
        return false;
      }
      // Une commande parametree sans sa cible ne devine rien : elle ne fait rien.
      if (c.parametre && !cible?.[c.parametre]) return false;
      c.executer(source, cible);
      return true;
    },
    obtenir: (id) => commandes.get(id),
    etat(id) {
      const c = commandes.get(id);
      if (!c) return { utilisable: false, raison: 'inconnue' };
      if (droits.branchee()) {
        if (c.capacite && !droits.aCapacite(c.capacite)) return { utilisable: false, raison: 'capacite', message: PHRASE_CAPACITE };
        if (c.permission && !droits.aPermission(c.permission)) return { utilisable: false, raison: 'permission', message: PHRASE_PERMISSION };
        const quota = typeof c.quota === 'function' ? c.quota() : c.quota;
        if (quota) {
          const reste = droits.reste(quota);
          if (reste !== null && reste <= 0) return { utilisable: false, raison: 'quota', message: droits.phraseQuota?.(quota) ?? PHRASE_QUOTA };
        }
      }
      if (c.actif && !c.actif()) return { utilisable: false, raison: 'contexte' };
      return { utilisable: true };
    },
    effacee(id) {
      const e = registre.etat(id);
      return !e.utilisable && e.raison === 'capacite';
    },
    lister: (groupe) => [...commandes.values()].filter((c) => !groupe || c.groupe === groupe)
  };
  return registre;
}

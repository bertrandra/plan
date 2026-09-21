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
  | '3d' | 'visionneuse' | 'cloture' | 'plu';

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
  /** `source` est l'element qui a declenche la commande, pour celles qui changent son etat. */
  executer: (source?: HTMLElement) => void;
}

export interface RegistreCommandes {
  /** Refuse un identifiant deja pris : deux boutons pour un geste, c'est une commande et deux liaisons. */
  declarer(commande: Commande): void;
  /** Rend `false` si la commande est inconnue ou inactive ; ne leve jamais. */
  executer(id: string, source?: HTMLElement): boolean;
  obtenir(id: string): Commande | undefined;
  lister(groupe?: GroupeCommande): Commande[];
  /** Lie un element du DOM a une commande : un clic l'execute, l'element lui est passe en source. */
  lier(idDom: string, idCommande: string): void;
  /** Declare puis lie, en un geste — la forme courante dans les ecouteurs. */
  bouton(idDom: string, commande: Commande): void;
}

/** Le document est injectable pour les tests ; par defaut, celui de la page. */
export function creerRegistre(doc: Pick<Document, 'getElementById'> = document): RegistreCommandes {
  const commandes = new Map<string, Commande>();
  const registre: RegistreCommandes = {
    declarer(c) {
      if (commandes.has(c.id)) throw new Error('Commande deja declaree : ' + c.id);
      commandes.set(c.id, c);
    },
    executer(id, source) {
      const c = commandes.get(id);
      if (!c || (c.actif && !c.actif())) return false;
      c.executer(source);
      return true;
    },
    obtenir: (id) => commandes.get(id),
    lister: (groupe) => [...commandes.values()].filter((c) => !groupe || c.groupe === groupe),
    lier(idDom, idCommande) {
      if (!commandes.has(idCommande)) throw new Error('Commande inconnue : ' + idCommande);
      const el = doc.getElementById(idDom);
      if (!el) throw new Error('Element introuvable pour ' + idCommande + ' : #' + idDom);
      el.addEventListener('click', () => { registre.executer(idCommande, el); });
    },
    bouton(idDom, commande) {
      registre.declarer(commande);
      registre.lier(idDom, commande.id);
    }
  };
  return registre;
}

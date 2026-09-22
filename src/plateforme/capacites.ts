// Les capacites que Plan propose au catalogue de la plateforme (spec-connexion-plateforme §4.3).
//
// ---------------------------------------------------------------------------------------------
// Pourquoi cette table existe, et pourquoi elle n'est pas encore branchee
// ---------------------------------------------------------------------------------------------
//
// Une capacite ne rend pas le fichier livre plus petit : le build inline tout, y compris ce qui est
// derriere un `import()` dynamique. Ce qu'une capacite empeche reellement, c'est **l'appel au
// reseau** — three.js et ses trois aides restent au CDN, les appels IGN n'ont pas lieu, le
// catalogue de textures n'est pas demande. C'est un vrai gain sur une liaison lente, et une vraie
// reduction de ce a quoi la page parle.
//
// **Ces codes ne sont attaches a aucune commande, et c'est deliberé.** Le catalogue de la
// plateforme, releve le 22 septembre 2026, porte `exports`, `max_projects`, `plan.documents`,
// `users` et `white_label` — aucun de ceux-ci. Or `/me/context` ne permet pas de distinguer « cette
// organisation n'a pas achete cette fonction » de « cette fonction n'existe pas au catalogue » :
// les deux se lisent pareil, par une absence dans `capabilities`. Attacher `plan.3d` aujourd'hui
// ferait donc **disparaitre la vue 3D chez tous les locataires existants**, ce qui n'est pas une
// mise en service mais une regression.
//
// L'etape 2 de la liste de l'operateur (§11) cree ces codes. Le jour ou c'est fait, brancher se
// resume a une ligne par commande — `capacite: CAPACITES.vue3d.code` — et le registre fait deja
// tout le reste depuis l'etape 3.

/** Une capacite proposee : son code, ce qu'elle gouverne, et ce qu'elle empeche d'aller chercher. */
export interface CapaciteProposee {
  code: string;
  libelle: string;
  /** Les identifiants de commande qu'elle gouverne. */
  commandes: readonly string[];
  /** Les origines auxquelles la page ne parle plus quand la capacite manque. Vide : aucune. */
  origines: readonly string[];
}

export const CAPACITES = {
  cadastre: {
    code: 'plan.cadastre',
    libelle: 'Import cadastral et bati IGN',
    commandes: ['projet.depuisAdresse', 'projet.actualiserIgn'],
    origines: ['https://api-adresse.data.gouv.fr', 'https://apicarto.ign.fr', 'https://data.geopf.fr']
  },
  ortho: {
    code: 'plan.ortho',
    libelle: 'Fond orthophoto IGN',
    commandes: ['affichage.orthophoto', 'affichage.orthoOpacite', 'affichage.orthoParcelleOpacite'],
    origines: ['https://data.geopf.fr']
  },
  plu: {
    code: 'plan.plu',
    libelle: "Regles d'urbanisme (PLU)",
    commandes: ['plu.interroger'],
    origines: ['https://apicarto.ign.fr']
  },
  terrasse: {
    code: 'plan.terrasse',
    libelle: 'Moteur terrasse, debit, implantation, chantier',
    commandes: ['terrasse.optimisation'],
    // Le moteur est local : le gater ne fait economiser aucun octet en transit, seulement des
    // ecrans. C'est une capacite commerciale, pas une capacite technique, et la table le dit.
    origines: []
  },
  vue3d: {
    code: 'plan.3d',
    libelle: 'Vue 3D et visionneuse GLB',
    // **Vide, et c'est un constat, pas un oubli.** Passer en vue 3D est un bouton de la barre de
    // modes (app/modes.ts), pas une commande du registre : une capacite posee ici n'arreterait donc
    // PAS le chargement de three.js depuis le CDN, qui est pourtant le seul vrai gain reseau de
    // toute la table. Faire de ce basculement une commande est le prealable a cette capacite-la, et
    // c'est un travail de l'interface, pas des droits. Le test le garde visible.
    commandes: [],
    origines: ['https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net', 'https://api.polyhaven.com', 'https://cdn.polyhaven.com', 'https://dl.polyhaven.org']
  },
  exportDxf: {
    code: 'plan.export.dxf',
    libelle: 'Export DXF',
    commandes: ['export.dxf'],
    origines: []
  },
  exportDossier: {
    code: 'plan.export.dossier',
    libelle: 'Dossier PDF des terrasses',
    commandes: ['export.dossier'],
    origines: []
  }
} as const satisfies Record<string, CapaciteProposee>;

/** Tous les codes, pour le jour ou l'operateur les cree au catalogue. */
export const CODES_CAPACITES: readonly string[] = Object.values(CAPACITES).map((c) => c.code);

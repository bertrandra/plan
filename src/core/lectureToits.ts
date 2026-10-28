// La lecture des toits en tache de fond, ou elle en est (app/toits/toitsFond.ts, core/).
//
// La barre d'etat dit « Toits LiDAR : 120 / 2 400 », puis « Murs (photos) : … », et le menu Fichier propose de suspendre ou de
// reprendre. L'ecouteur ecrit cet etat, les zones le lisent : il vit ici, sous les deux, comme la
// lecture du relief (core/lectureRelief.ts). Rien ici ne s'enregistre.

/** Ou en est la lecture : les batiments lus parmi ceux dont Plan choisit le toit. */
export interface ProgressionToits {
  faits: number;
  total: number;
  /** En cours, en pause (suspendue par l'utilisateur), arretee faute de service, ou finie. */
  etat: 'enCours' | 'pause' | 'arretee' | 'finie';
  /** Apres les toits, la couleur des murs sur les photos de rue (app/toits/mursFond.ts) : `faits` compte alors les batiments. */
  phase?: 'murs';
}

let courante: ProgressionToits | null = null;
const abonnes = new Set<() => void>();
/** Qui relance la lecture quand un batiment redevient a lire (app/boot/branchementToits.ts) ; rien tant que personne ne l'a branche. */
let relancer: (() => void) | null = null;

export const lectureToits = {
  progression: (): ProgressionToits | null => courante,
  definir(p: ProgressionToits | null): void {
    if (JSON.stringify(p) === JSON.stringify(courante)) return;
    courante = p;
    abonnes.forEach(f => f());
  },
  abonner(f: () => void): () => void { abonnes.add(f); return () => { abonnes.delete(f); }; },
  /** Un batiment redevient a lire (son contour a change de forme, core/deformation.ts) : la lecture en fond le reprendra. */
  demanderRelecture(): void { relancer?.(); },
  /** Branche ce qui relance la lecture ; rend le debranchement. */
  surRelecture(f: () => void): () => void { relancer = f; return () => { if (relancer === f) relancer = null; }; }
};

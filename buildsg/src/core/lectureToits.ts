// La lecture des toits en tache de fond, ou elle en est (app/toitsFond.ts, core/).
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
  /** Apres les toits, la couleur des murs sur les photos de rue (app/mursFond.ts) : `faits` compte alors les batiments. */
  phase?: 'murs';
}

let courante: ProgressionToits | null = null;
const abonnes = new Set<() => void>();

export const lectureToits = {
  progression: (): ProgressionToits | null => courante,
  definir(p: ProgressionToits | null): void {
    if (JSON.stringify(p) === JSON.stringify(courante)) return;
    courante = p;
    abonnes.forEach(f => f());
  },
  abonner(f: () => void): () => void { abonnes.add(f); return () => { abonnes.delete(f); }; }
};

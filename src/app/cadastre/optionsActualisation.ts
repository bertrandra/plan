// Ce que le dialogue d'actualisation IGN montre et ce qu'il rend : seuls, pour que le parcours (app/parcours.ts) les porte sans
// dependre de l'actualisation elle-meme (app/cadastre/actualisationIgn.ts), qui ouvre ce parcours.

import type { PtBrut } from '../../model/types.js';
import type { VoisinageRayon } from '../../geo/apiIgn.js';

/** Une option de portee et de voisinage, choisie dans la boite de dialogue d'actualisation. */
export interface OptionsActualisation {
  portee: 'tout' | 'parcelle';
  /**
   * Le voisinage : les parcelles adjacentes (defaut), ou tout ce qui est dans un rayon (`rayonM`,
   * jusqu'a 1 500 m) — parcelles et batiments, en plusieurs requetes a l'IGN, les plus proches d'abord.
   */
  voisinage: { actif: false } | { actif: true; batiments: boolean; vegetation: boolean; arbres: boolean; rayonM?: number };
  /**
   * Le relief du terrain, relu a l'IGN apres le reste : sur la parcelle du projet, ou sur toutes les
   * parcelles du plan. Absent ou inactif : la grille en place n'est pas touchee.
   */
  relief?: { actif: boolean; toutesParcelles: boolean };
  /**
   * « Actualiser le projet » (app/cadastre/actualiserProjet.ts) : chaque objet importe est d'abord ramene aux
   * valeurs par defaut, et le relief relu reprend l'affichage par defaut.
   */
  parDefaut?: boolean;
  /**
   * « Actualiser le projet » : les batiments de la parcelle du projet (importes ou dessines) sont
   * supprimes, puis recrees depuis la BD TOPO comme a un import d'aujourd'hui. Si la BD TOPO ne
   * repond pas, ils restent tels quels.
   */
  recreerBatiments?: boolean;
  /**
   * Les batiments verifies sur place par un audit de la parcelle (model/toitVerifie.ts, le 100 % du
   * projet) : `garder` (defaut) les laisse tels quels - ni recrees, ni relus, ni ramenes aux valeurs
   * par defaut ; `relire` les traite comme les autres, quand l'utilisateur le demande expressement.
   */
  verifies?: 'garder' | 'relire';
  /**
   * Les objets retouches a la main (model/retouche.ts) dont la personne reprend la version de l'IGN, par cle : remplaces par leur
   * source, leur marque retire, leur cle gardee. Un objet retouche absent d'ici est garde tel quel (decision du 27 octobre 2026).
   */
  reprendre?: readonly string[];
}

/** Un objet retouche a la main, tel que le dialogue le propose : sa cle, et le libelle de sa case. */
export interface ObjetRetouche { cle: string; libelle: string }

/** Ce que le dialogue affiche du plan avant d'actualiser. */
export interface InfosActualisation {
  /** « Parcelle AB 123 — Le Vesinet ». */
  parcelle: string;
  /** Objets importes de la BD TOPO deja presents. */
  nbIgn: number;
  /** Parcelles voisines deja presentes : elles ne seront pas dupliquees. */
  nbVoisines: number;
  /** La capacite `plan.relief` : sans elle, le dialogue ne propose pas le relief. */
  reliefPermis: boolean;
  /** Le plan a deja un relief : l'actualiser le remplace (zRef compris). */
  aUnRelief: boolean;
  /**
   * De quoi compter le voisinage etendu avant de lancer : le centre de la parcelle (repere du plan),
   * la lecture du disque au palier qui couvre le rayon demande (geo/apiIgn `rayonDeLecture`), et
   * ce qui est deja dans le plan (ni compte, ni duplique).
   */
  /** Les objets retouches a la main : une case chacun, decochee, pour reprendre la version de l'IGN. Vide : le dialogue n'en dit rien. */
  retouches?: ObjetRetouche[];
  voisinage?: { centre: PtBrut; lire: (rayonM: number) => Promise<VoisinageRayon>; idus: ReadonlySet<string>; ids: ReadonlySet<string> };
}

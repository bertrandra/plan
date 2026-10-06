// La lecture du relief en cours (MD/spec-relief.md §8, core/).
//
// Une seule lecture a la fois, pendant une a trois secondes : la commande « Lire le relief » se
// grise, et le bouton de l'inspecteur dit « Lecture… ». L'ecouteur (app/ecouteurs/relief.ts) ecrit
// cet etat ; le descripteur de champ (ui/champs/relief.ts) le lit. Il vit ici, sous les deux, parce
// que `ui` n'importe pas `app`. Rien ici ne s'enregistre : c'est un etat d'interface, comme
// l'actualisation IGN (app/actualisationIgn.ts) dont il reprend la forme.

let enCours = false;
const abonnes = new Set<() => void>();

export const lectureRelief = {
  enCours: (): boolean => enCours,
  /** Marque la lecture commencee ou finie, et le dit aux abonnes (le magasin, qui redessine les zones). */
  definir(valeur: boolean): void {
    if (enCours === valeur) return;
    enCours = valeur;
    abonnes.forEach(f => f());
  },
  abonner(f: () => void): () => void { abonnes.add(f); return () => { abonnes.delete(f); }; }
};

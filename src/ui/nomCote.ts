// Le nom d'un cote a l'ecran (lot 4 de la simplification de l'IHM).
//
// Les contours venus du cadastre et de l'IGN nomment leurs cotes « Cote 1 », « Cote 2 »… dans le projet : c'est une donnee,
// enregistree et exportee telle quelle (les exports sont sous empreintes). A l'ecran, ce nom par defaut s'ecrit « Côté 1 » ;
// un nom donne par la personne reste le sien.

/** Le nom du cote `i` (0, 1…) tel que l'ecran le montre : un nom par defaut d'apres la place du cote, un nom saisi tel quel. */
export { nomAfficheDuCote as nomDuCote } from '../model/formes.js';

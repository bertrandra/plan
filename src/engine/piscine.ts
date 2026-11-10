// Piscine : le bassin, ses abords, sa filtration, son chiffrage et sa note de calcul (engine/).
//
// Une piscine est un polygone ou un cercle du plan de fonction `piscine`. Le contour est le bord
// interieur de l'eau (le nu interieur des parois) : la surface du plan d'eau, celle que l'urbanisme
// compte. Tout le reste s'en deduit vers l'exterieur : parois, margelles, plage, fouille.
//
// Le module repond a trois questions, dans l'ordre ou l'utilisateur les pose :
//   1. ou et comment est le bassin — enterre, semi-enterre ou hors-sol ; coque, maconnerie ou kit ;
//      fond plat, en pente ou a fosse — et ce qu'il contient d'eau ;
//   2. ce qu'il faut autour — margelles, plage en bois (avec sa structure et ses fondations) ou en
//      dallage — et ce qu'il faut dedans — filtration, eclairage, traitement, chauffage, securite ;
//   3. ce que cela coute (`chiffrerPiscine`), et ce que cela vaut comme dimensionnement
//      (`noteDeCalcul`) : volumes, hydraulique, structure de la plage, poussee de l'eau, regime
//      d'autorisation, distances aux limites.
//
// Les quantites sont des quantites d'avant-projet, posees sur des regles de metier (temps de
// recyclage de 4 h, vitesse de filtration de 50 m/h, un skimmer pour 25 m², NF DTU 51.4 pour la
// plage en bois). Les prix sont des ordres de grandeur TTC fourniture et pose, reglables poste par
// poste. Ce n'est ni une etude de sol, ni une note de calcul beton : la note le dit.
//
// Le module est decoupe par etape (MD/roadmap-architecture.md, etape 4.2) : reglages, geometrie, calcul, chiffrage, note. Ce fichier
// les reexporte : le reste du programme importe toujours depuis engine/piscine.js.

export * from './piscine/reglages.js';
export * from './piscine/geometrie.js';
export * from './piscine/calcul.js';
export * from './piscine/chiffrage.js';
export * from './piscine/note.js';

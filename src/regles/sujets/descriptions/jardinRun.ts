// La lecture du jardin (lot L3 de la lecture IA elargie) : la requete UNIQUE que le sujet « jardin » envoie pour la parcelle, sur
// l'orthophoto recadree sur elle (et les photos de la cloture et du portail quand la capture en a). Elle rend ce qu'on voit du
// jardin : les arbres (leur genre dans une liste fermee, leur taille), les haies, les clotures, portails et murets, les bordures, les
// chemins, la terrasse et la piscine deja la, le potager, les plates-bandes, les regards, l'eclairage et les robinets ; chacun a sa
// place sur l'image, en parts. Le moteur (facade/regles/jardin.ts) en fait des objets du plan, en metres, par le geo-referencement de
// l'image ; une personne les confirme dans l'avant/apres de l'audit.
//
// Donnees pures, comme le run d'une facade : `npm run regles:generer` en ecrit deploy/prompt-jardin.md et
// deploy/schema-jardin.json (generation.ts), jamais a la main. Chaque champ a un lecteur (src/regles/jardin/observations.ts).
//
// Les essences de la bibliotheque de l'administrateur ne peuvent pas entrer dans un schema fige (elle change sans PR) : Claude dit
// un GENRE dans une liste fermee, et une regle le rapproche de l'essence la plus proche de la bibliotheque du moment
// (facade/regles/jardin.ts, `especeDuGenre`).

import type { SchemaJson } from '../description.js';

/** Les genres d'arbres que Claude peut nommer : la liste fermee du schema, que la regle rapproche de la bibliotheque. */
export const GENRES_ARBRE = [
  'chene', 'pin', 'peuplier', 'hetre', 'charme', 'bouleau', 'erable', 'frene', 'platane', 'tilleul', 'marronnier', 'noyer', 'robinier',
  'saule', 'cerisier', 'pommier', 'poirier', 'prunier', 'olivier', 'magnolia', 'lilas', 'laurier', 'houx', 'buis', 'thuya', 'if',
  'cypres', 'cedre', 'epicea', 'sapin', 'sequoia', 'eucalyptus', 'palmier', 'autre-feuillu', 'autre-conifere', 'indetermine',
] as const;

export const GENRES_OBJET = ['arbre', 'haie', 'cloture', 'portail', 'muret', 'bordure', 'chemin', 'terrasse', 'piscine', 'potager', 'plate-bande', 'regard', 'eclairage', 'robinet'] as const;

const PROMPT = `# Rôle

Vous aidez le logiciel Plan à lire **le jardin d'une parcelle** sur une photo aérienne. Plan connaît déjà, par le cadastre et l'IGN, le contour de la parcelle et ses bâtiments : vous ne les décrivez pas. Vous dites **ce qu'il y a dans le jardin** et **où**, en proportions de l'image. Plan transforme chaque position en mètres, la compare à ce que le plan contient déjà, et une personne confirme chaque objet avant qu'il n'entre dans le projet. Une réponse prudente vaut mieux qu'une réponse fausse : ce que vous ne voyez pas n'entre pas dans la liste.

# Ce que vous recevez

- **Image 1 : l'orthophoto**, vue du dessus, nord en haut, recadrée sur la parcelle avec une marge. Le contour de la parcelle est tracé en jaune, les bâtiments que Plan connaît en blanc. Une barre d'échelle en bas à gauche.
- **Les images suivantes, s'il y en a** : des photos prises sur place (la clôture, le portail). Elles aident à reconnaître une nature (un grillage, une palissade, un muret), jamais à placer : les positions se lisent sur l'image 1 seule.
- **Un texte** : la taille de l'image en mètres, et ce que le plan contient déjà dans le jardin (ce qui y est n'a pas besoin d'être redit, mais vous pouvez le redire si vous le voyez).

# Le repère

- \`x\` va de 0 (le bord gauche de l'image 1) à 1 (le bord droit), \`y\` de 0 (le bord haut) à 1 (le bord bas).
- **Tous les nombres de la réponse sont des parts de l'image**, jamais des pixels ni des mètres. Donnez-les au centième (0.37).
- \`etendue\` est une longueur en part du côté de l'image : le diamètre du houppier d'un arbre, la largeur d'une haie ou d'un chemin ; 0 quand elle ne s'applique pas.

# Comment remplir la réponse

- \`objets\` : chaque chose du jardin, une entrée par objet, dans l'ordre que vous voulez :
  - \`genre\` : \`arbre\`, \`haie\`, \`cloture\` (grillage, palissade, panneaux), \`portail\` (ou portillon, dans la clôture), \`muret\` (un mur bas en limite), \`bordure\` (une bordure de massif ou d'allée), \`chemin\` (une allée), \`terrasse\` (une terrasse déjà là, dallée ou en bois, hors des bâtiments), \`piscine\`, \`potager\`, \`plate-bande\` (un massif de fleurs ou d'arbustes bas), \`regard\` (une plaque carrée au sol), \`eclairage\` (une borne ou un candélabre), \`robinet\` (un point d'eau) ;
  - \`points\` : sa place dans l'image. **Un point** pour un \`arbre\` (le centre du houppier), un \`portail\` (son milieu), un \`regard\`, un \`eclairage\`, un \`robinet\` ; **une ligne** (deux points ou plus, dans l'ordre) pour une \`haie\`, une \`cloture\`, un \`muret\`, une \`bordure\`, un \`chemin\` (son axe) ; **un contour** (trois points ou plus, sans répéter le premier) pour une \`terrasse\`, une \`piscine\`, un \`potager\`, une \`plate-bande\` ;
  - \`etendue\` : le diamètre du houppier d'un arbre, la largeur d'une haie ou d'un chemin, en part du côté de l'image ; 0 pour le reste ;
  - \`arbre\` : pour un arbre, son \`genre\` dans la liste fermée (\`autre-feuillu\` ou \`autre-conifere\` si vous ne le reconnaissez pas, \`indetermine\` si vous ne savez pas même cela), sa \`taille\` (\`petit\` jusqu'à 6 m, \`moyen\` de 6 à 12 m, \`grand\` de 12 à 20 m, \`tres-grand\` au-delà) et \`persistant\` (\`oui\` s'il garde ses feuilles l'hiver, un conifère par exemple, \`non\` s'il les perd) ; la liste fermée des genres : ${GENRES_ARBRE.map((g) => '`' + g + '`').join(', ')} ; pour tout autre objet, \`genre\` \`sans-objet\`, \`taille\` et \`persistant\` \`indetermine\` ;
  - \`nature\` : ce qu'il est fait de, dans la liste ; \`sans-objet\` quand rien ne s'applique, \`indetermine\` quand vous ne le voyez pas. Une clôture : \`grillage\`, \`palissade\`, \`mur\` ; un chemin ou une terrasse : \`gravier\`, \`dalles\`, \`bois\`, \`beton\`, \`pelouse\` ; une plate-bande : \`fleurs\`, \`arbustes\`, \`vivaces\`, \`mixte\` ;
  - \`indices\` : ce qui vous le fait dire : \`vu\` (la chose vue, en quelques mots) et \`image\` (le numéro de l'image où vous la voyez) ;
  - \`certitude\` : \`forte\`, \`moyenne\` ou \`faible\`.
- \`confiance\` : ce que vous pensez de votre lecture d'ensemble : \`forte\`, \`moyenne\` ou \`faible\`.

# Ce qui trompe

1. **L'ombre d'un arbre ou d'un bâtiment** n'est pas un objet : un arbre se place au centre de son houppier, pas de son ombre.
2. **Un bâtiment, une véranda, un abri de jardin** ne sont pas dans la liste : Plan les connaît (en blanc sur l'image 1). Une terrasse collée à la maison en est une si elle est découverte.
3. **Le jardin du voisin** : seul ce qui est dans le contour jaune, ou sur lui (une clôture, une haie de limite), entre dans la réponse.
4. **Une haie de limite et une clôture** : une bande verte continue est une haie ; une ligne fine et régulière, une clôture. Les deux à la fois : donnez les deux.
5. **Une piscine couverte** (bâche, abri bas) reste une piscine ; un bassin d'ornement de moins de 2 m n'en est pas une.
6. **Un regard** est petit (moins d'un mètre) et régulier : ne le devinez pas sur une tache.

# Règles de prudence

- Un objet que vous n'êtes pas sûr de voir n'entre pas, ou entre avec la \`certitude\` \`faible\`.
- Ne comptez pas : un objet par entrée. Dix arbres, dix entrées.
- N'inventez aucune position hors de l'image 1.
`;

const nombre = { type: 'number' } as const;
const objet = (proprietes: Record<string, unknown>): SchemaJson => ({ type: 'object', additionalProperties: false, required: Object.keys(proprietes), properties: proprietes });
const terme = (...termes: readonly string[]): SchemaJson => ({ type: 'string', enum: [...termes] });
const liste = (items: unknown): SchemaJson => ({ type: 'array', items });

export const NATURES_OBJET_JARDIN = ['grillage', 'palissade', 'mur', 'gravier', 'dalles', 'bois', 'beton', 'pelouse', 'fleurs', 'arbustes', 'vivaces', 'mixte', 'sans-objet', 'indetermine'] as const;

/** Le schema de la reponse : chaque champ a son lecteur (src/regles/jardin/observations.ts). */
const SCHEMA: SchemaJson = objet({
  objets: liste(objet({
    genre: terme(...GENRES_OBJET),
    points: liste(objet({ x: nombre, y: nombre })),
    etendue: nombre,
    arbre: objet({
      genre: terme(...GENRES_ARBRE, 'sans-objet'),
      taille: terme('petit', 'moyen', 'grand', 'tres-grand', 'indetermine'),
      persistant: terme('oui', 'non', 'indetermine'),
    }),
    nature: terme(...NATURES_OBJET_JARDIN),
    indices: liste(objet({ image: { type: 'integer' }, vu: { type: 'string' } })),
    certitude: terme('forte', 'moyenne', 'faible'),
  })),
  // A la racine, un terme manquant prend le premier du vocabulaire (deploy/analyse-fonctions.php::conformer) : `faible`, le plus prudent.
  confiance: terme('faible', 'moyenne', 'forte'),
});

/**
 * Un EXEMPLE de reponse, pour un jardin invente : ce que le serveur montre a Claude quand la sortie structuree ne sert pas (son repli),
 * a la place du schema (Haiku recopiait le schema en texte, verification de l'API du 29 octobre 2026). L'exemple a la forme du schema
 * (tests/unit/regles/sujets/generation.test.ts) ; ses valeurs ne disent rien d'un vrai jardin.
 */
const EXEMPLE = {
  objets: [
    { genre: 'arbre', points: [{ x: 0.31, y: 0.22 }], etendue: 0.12, arbre: { genre: 'bouleau', taille: 'moyen', persistant: 'non' }, nature: 'sans-objet', indices: [{ image: 1, vu: 'houppier clair et léger, ombre allongée' }], certitude: 'moyenne' },
    { genre: 'haie', points: [{ x: 0.08, y: 0.1 }, { x: 0.08, y: 0.9 }], etendue: 0.03, arbre: { genre: 'sans-objet', taille: 'indetermine', persistant: 'indetermine' }, nature: 'sans-objet', indices: [{ image: 1, vu: 'bande vert sombre continue le long de la limite ouest' }], certitude: 'forte' },
    { genre: 'chemin', points: [{ x: 0.5, y: 0.95 }, { x: 0.5, y: 0.62 }], etendue: 0.04, arbre: { genre: 'sans-objet', taille: 'indetermine', persistant: 'indetermine' }, nature: 'gravier', indices: [{ image: 1, vu: 'allée claire du portail à la maison' }], certitude: 'forte' },
    { genre: 'plate-bande', points: [{ x: 0.62, y: 0.7 }, { x: 0.78, y: 0.7 }, { x: 0.78, y: 0.76 }, { x: 0.62, y: 0.76 }], etendue: 0, arbre: { genre: 'sans-objet', taille: 'indetermine', persistant: 'indetermine' }, nature: 'fleurs', indices: [{ image: 1, vu: 'bande de terre et de couleurs au bord de la pelouse' }], certitude: 'moyenne' },
    { genre: 'regard', points: [{ x: 0.44, y: 0.58 }], etendue: 0, arbre: { genre: 'sans-objet', taille: 'indetermine', persistant: 'indetermine' }, nature: 'sans-objet', indices: [{ image: 1, vu: 'petit carré gris au pied de la façade' }], certitude: 'faible' },
  ],
  confiance: 'moyenne',
};

/**
 * La consigne du repli sans sortie structuree (le batch de l'audit) : celle du serveur parle d'une facade inventee et de parts d'une
 * facade ; celle-ci, d'un jardin (le fichier de schema la porte, comme celui de la lecture du PLU).
 */
const CONSIGNE = 'Répondez par un seul objet JSON, sans texte avant ni après et sans bloc de code, avec exactement les clés de l’exemple ci-dessous, dans le même ordre. C’est un EXEMPLE, pour un jardin inventé : ses valeurs ne sont pas à recopier, la réponse dit ce que l’image 1 montre, et la liste `objets` a autant d’entrées que vous voyez d’objets (aucune s’il n’y en a pas). Tous les nombres sont des parts de l’image, comme expliqué plus haut : jamais des pixels ni des mètres.';

/** La lecture du jardin : son prompt, son schema, l'exemple et la consigne du repli, tels que le serveur les sert (usage `jardin`). */
export const RUN_JARDIN: { prompt: string; schema: SchemaJson; exemple: object; consigne: string } = { prompt: PROMPT, schema: SCHEMA, exemple: EXEMPLE, consigne: CONSIGNE };

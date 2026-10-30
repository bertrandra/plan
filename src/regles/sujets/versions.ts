// Les versions du prompt et du schema d'analyse. Un changement de texte change la version, qui suit
// chaque ligne du journal de consommation : la table dit quelle empreinte du texte la porte, et un
// test refuse un texte change sous la meme version (comme LECTURES_TOITS pour les toits).

/** L'empreinte d'un texte (FNV-1a, 32 bits), en hexadecimal : de quoi voir qu'il a change, pas plus. */
export function empreinteTexte(texte: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i++) { h ^= texte.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export interface VersionTexte { version: number; empreinte: string }

/** La note de l'en-tete du prompt : l'histoire des versions, la derniere en dernier. */
export const NOTE_PROMPT = `Partie fixe du prompt « béton » (spec-regles-toits.md §14.3, spec-audit.md §13.2), envoyée en system et mise en cache. Tout ce qui suit la ligne de tirets part tel quel. Un changement de texte change la version, qui suit chaque ligne du journal. Version 1 (lot L17) : les façades aussi — photos par façade, rendu du modèle depuis la même prise de vue, ouvertures détectées par Plan, détails et matériau du parement. Toujours sans exemples annotés : ils viendront du corpus validé (§14.3, point 5). Version 2 (15 octobre 2026) : le texte ne change pas, mais le schéma de la réponse le suit dans le même bloc system (deploy/analyse.php::promptAvecSchema) au lieu de partir en sortie structurée, dont l'API refusait la grammaire. Version 3 (16 octobre 2026) : sans rendu joint, le texte le dit et le modèle n'en cite aucun (il décrivait « le rendu du modèle » qu'il n'avait pas reçu) ; un mur d'un bâtiment qui en a plusieurs de même orientation porte le numéro de son côté (« est (côté 3) »), une entrée de \`facades\` par étiquette. Version 4 (17 octobre 2026) : les pignons d'abord — la silhouette du haut de chaque façade (triangle, trapèze, rampe, marches, ligne droite) est lue sur la photo et sur le rendu, et c'est elle qui dit la forme du toit et ses bouts ; tout désaccord de silhouette entre le rendu et la photo va dans \`ecarts\`. Le rendu d'une façade est coupé à cette façade (ni dépendance devant le mur, ni aile contre ses bouts) et porte le contour noir des murs, du pignon et du toit. Version 5 (16 octobre 2026) : trois familles de termes du schéma que le texte ne définissait pas le sont — les matériaux de couverture (\`tuile-plate\`, \`tuile-canal\`, \`tuile-mecanique\`, \`ardoise\`, \`zinc\`, \`bac-acier\`, \`membrane\`, \`gravillons\`, \`vegetale\`), le sens du faîtage (\`parallele-rue\`, \`perpendiculaire-rue\`, \`sans-faitage\`) et le châssis d'éclairage (\`chassis-eclairage\`) ; Claude ne les devine plus de son vocabulaire. Version 6 (16 octobre 2026) : la silhouette de chaque façade (\`silhouette\` : \`pignon\`, \`croupe\`, \`trapeze\`, \`rectangle\`, \`rampe\`) est lue sur sa photo ; Plan en déduit les bouts du faîtage et, par le moteur des toits, la forme du toit. Version 7 (16 octobre 2026) : la silhouette de chaque façade parle le vocabulaire de la réponse — \`silhouette\` dans les mots de « Lire les pignons d’abord » (\`triangle\`, \`trapeze\`, \`rampe\`, \`ligne-droite\`, \`marches\`, \`plusieurs-sommets\`) et \`bout\` dans ceux de \`bouts.gauche\` (\`pignon\`, \`croupe\`, \`demi-croupe\`, \`brisis\`, \`sans-objet\`) ; le sens du faîtage et les bouts du toit s’en déduisent. Version 8 (17 octobre 2026) : la couverture connaît la grande ardoise posée en losange (\`ardoise-losange\`). Version 9 (17 octobre 2026) : la teinte et le décor des murs (\`teinteMurs\`, \`decorMurs\`), que Claude décrivait en clair dans \`ecarts\` sans que Plan puisse en faire une proposition ; les images qui ne montrent pas le bâtiment (\`imagesHorsSujet\`), qu'il signalait de même ; et, pour chaque façade, le vitrage (verre plein, petits bois, imposte à petits bois), l'ouvrant (à la française, coulissant, guillotine, soufflet, fixe), la porte d'entrée, la porte de garage et la couleur des volets.`;

/** La note de l'en-tete du schema. */
export const NOTE_SCHEMA = `Sortie structuree de l'analyse d'une maison par Claude (spec-regles-toits.md 14.2 et 14.3 ; spec-audit.md 13.2). Vocabulaire ferme des paragraphes 2 et 3, indetermine partout, indices avant la conclusion. Version 1 (lot L17) : les facades aussi (ouvertures par niveau, manquees ou en trop par la detection, details, materiau du parement). Version 2 : la silhouette du haut de chaque facade (\`silhouette\`). Version 3 : la silhouette dans le vocabulaire des pignons, et le \`bout\` que chaque facade ferme. Le schema part a la suite du prompt (plus dans output_config.format depuis le 15 octobre 2026 : l'API refusait sa grammaire), et la reponse y est ramenee par le serveur (deploy/analyse.php::conformer) ; un changement de champ ou de terme change la version, qui suit chaque ligne du journal. Version 4 : la couverture admet \`ardoise-losange\`. Version 5 : \`teinteMurs\` et \`decorMurs\` (champs simples), \`imagesHorsSujet\` (les numeros des images qui ne montrent pas le batiment), et dans \`facades[].details\` : \`vitrage\`, \`ouvrant\`, \`porte\`, \`garage\`, \`couleurVolets\`.`;

/** Les versions du CORPS du prompt, la plus recente en dernier. Une ligne de plus a chaque changement de texte. */
export const VERSIONS_PROMPT: readonly VersionTexte[] = [
  { version: 4, empreinte: '4b4451da' },
  { version: 5, empreinte: 'cf02e47e' },
  { version: 6, empreinte: '55c42b12' },
  { version: 7, empreinte: '1580de05' },
  { version: 8, empreinte: '0d721cb1' },
  { version: 9, empreinte: '8bee273b' },
];

/** Les versions du schema (serialise par `textuel`), la plus recente en dernier. */
export const VERSIONS_SCHEMA: readonly VersionTexte[] = [
  { version: 1, empreinte: '785f4411' },
  { version: 2, empreinte: '4149031f' },
  { version: 3, empreinte: '25d5ce8c' },
  { version: 4, empreinte: '75a4daf7' },
  { version: 5, empreinte: 'c95c08e0' },
];

export const versionCourante = (l: readonly VersionTexte[]): VersionTexte => l[l.length - 1] as VersionTexte;

/**
 * Le run d'une facade (MD/spec-facade-calage-audit.md §8, usage `facade` du serveur) : sa note, et les versions de son prompt et de
 * son schema, tenues comme celles de l'analyse d'une maison. La version suit chaque reponse enregistree (la calibration la rejoue).
 */
export const NOTE_PROMPT_FACADE = `Partie fixe du prompt du run d'une façade (spec-facade-calage-audit.md §8, lot F2), envoyée en system et mise en cache. Tout ce qui suit la ligne de tirets part tel quel. Un changement de texte change la version, qui suit chaque ligne du journal et chaque réponse enregistrée. Version 1 (lot F2, 29 octobre 2026) : une seule requête par façade, sur l'image prise pour la suite ; elle rend le calage (angles du mur dans le repère de l'image ; pointes, appentis, corps et ce qui cache dans le repère du mur), la forme du haut, les éléments du toit vus sur la ligne du haut, le parement du mur (enduit, pierre, brique, colombage, bardage bois ou métal, béton, mixte) et ses zones, les ouvertures, leurs détails et leurs carreaux ; le texte lui donne le parement que Plan connaît déjà. Elle remplace le renfort (trois passes, coins en repères d'une grille, avis sur des ouvertures numérotées) pour la calibration et le relevé. Version 2 (29 octobre 2026, après la vérification sur la vraie API) : tous les nombres sont des parts, jamais des pixels ni des mètres (une réponse donnait \`egout: 258\`) ; les seuls entiers sont des comptes.`;

export const NOTE_SCHEMA_FACADE = `Sortie du run d'une facade par Claude (spec-facade-calage-audit.md 8, lot F2). Angles du mur en part de l'image (x, y depuis le haut gauche), tout le reste en part du mur (u le long du mur, v en hauteurs d'egout depuis le sol) : Claude ne voit ni les pixels ni les metres. Vocabulaire ferme, indetermine partout ou un champ peut manquer ; un champ qu'aucun lecteur n'utilise n'y entre pas. Le schema part a la suite du prompt et la reponse y est ramenee par le serveur (deploy/analyse-fonctions.php::conformer) ; un changement de champ ou de terme change la version. Version 1 : calage, forme, elements, surface (parement principal et zones, dont le colombage), ouvertures, details et carreaux. Version 2 (29 octobre 2026) : les champs ne changent pas ; le fichier porte un \`exemple\` de reponse (une facade inventee), que le serveur montre a la place du schema quand la sortie structuree ne sert pas (Haiku recopiait le schema en texte et logeait ses valeurs dedans). Avec la sortie structuree, le schema part en \`output_config.format\` et plus a la suite du prompt.`;

export const VERSIONS_PROMPT_FACADE: readonly VersionTexte[] = [
  { version: 1, empreinte: '14715ba3' },
  { version: 2, empreinte: '941382fc' },
];

export const VERSIONS_SCHEMA_FACADE: readonly VersionTexte[] = [
  { version: 1, empreinte: '276ece16' },
  { version: 2, empreinte: 'c5c67d80' },
];

/**
 * La lecture du jardin (lot L3 de la lecture IA elargie, usage `jardin` du serveur) : sa note, et les versions de son prompt et de son
 * schema, tenues comme celles du run d'une facade. La version suit chaque lecture enregistree (l'audit la garde avec l'image envoyee).
 */
export const NOTE_PROMPT_JARDIN = `Partie fixe du prompt de la lecture du jardin (lot L3 de la lecture IA élargie), envoyée en system et mise en cache. Tout ce qui suit la ligne de tirets part tel quel. Un changement de texte change la version, qui suit chaque ligne du journal et chaque lecture enregistrée. Version 1 (lot L3, 29 octobre 2026) : une requête par parcelle, sur l'orthophoto recadrée sur elle (et les photos de la clôture et du portail s'il y en a) ; elle rend les objets du jardin (arbres et leur genre dans une liste fermée, haies, clôtures, portails, murets, bordures, chemins, terrasse et piscine déjà là, potager, plates-bandes, regards, éclairage, robinets), chacun à sa place sur l'image en parts.`;

export const NOTE_SCHEMA_JARDIN = `Sortie de la lecture du jardin par Claude (lot L3). Positions en part de l'image (x, y depuis le haut gauche), etendue en part de son cote : Claude ne voit ni les pixels ni les metres, Plan les convertit par le geo-referencement de l'image. Vocabulaire ferme ; le genre d'un arbre est une liste fermee que le moteur rapproche de la bibliotheque d'essences de l'administrateur. Le fichier porte un \`exemple\` de reponse (un jardin invente), que le serveur montre a la place du schema quand la sortie structuree ne sert pas. Version 1 (29 octobre 2026).`;

export const VERSIONS_PROMPT_JARDIN: readonly VersionTexte[] = [
  { version: 1, empreinte: '251639d8' },
];

export const VERSIONS_SCHEMA_JARDIN: readonly VersionTexte[] = [
  { version: 1, empreinte: '52e1240a' },
];

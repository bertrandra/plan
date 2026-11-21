// Les textes de l'audit des facades, de la calibration et de l'avant/apres tels que l'ecran les montre (le reste du lot 4 de la
// simplification de l'IHM).
//
// La chaine des facades (facade/releve/enchainement.ts), la reconciliation (facade/regles/reconciliation.ts, regles/reconciliation.json)
// et le corpus du banc ecrivent des textes qui sont aussi des donnees : le resume d'une etape et la raison d'un arbitrage s'enregistrent
// dans le fichier d'audit et dans un cas de calibration, des tests et `tauxAuto.ts` les comparent, les identifiants (`fenetre`,
// `ardoise-ecaille`, `degres`) servent de cles et partent chez Claude. On ne les change donc pas a la source : comme `ui/tableau.ts`
// pour la nomenclature et `ui/nomCote.ts` pour les cotes, ce module les ecrit en francais correct au moment de les montrer, et
// seulement la. Un texte ou un mot inconnu passe tel quel : rien n'est accentue mot par mot (« cote » et « côté », « a » et « à »).

/**
 * Les identifiants que l'ecran montrait tels quels (types d'ouverture, hauts de mur, bouts, materiaux, couvertures, formes de toit,
 * unites de regles/reconciliation.json), dans les mots de la personne. Seuls ceux dont l'ecriture differe y sont.
 */
const MOTS: Readonly<Record<string, string>> = {
  'fenetre': 'fenêtre', 'porte-fenetre': 'porte-fenêtre', 'fenetre-toit': 'fenêtre de toit',
  'trapeze': 'trapèze', 'ligne-droite': 'ligne droite', 'plusieurs-sommets': 'plusieurs sommets', 'indetermine': 'indéterminé', 'sans-objet': 'sans objet',
  'cheminee': 'cheminée', 'meuliere': 'meulière', 'beton': 'béton',
  'ardoise-ecaille': 'ardoise en écaille', 'tuile-plate-ecaille': 'tuiles plates en écaille', 'ardoise-losange': 'grande ardoise en losange', 'ecaille': 'écaille',
  'tuile-plate': 'tuile plate', 'tuile-canal': 'tuile canal', 'bac-acier': 'bac acier', 'vegetale': 'végétale',
  'dome': 'dôme', 'imperiale': 'impériale', 'fleche': 'flèche', 'carene': 'carène',
  'degres': 'degrés', 'defaut': 'défaut',
};

/** Un identifiant de la chaine dans les mots de l'ecran : « fenetre » → « fenêtre » ; un mot inconnu reste le sien. */
export function motEcran(mot: string): string {
  return Object.hasOwn(MOTS, mot) ? (MOTS[mot] as string) : mot;
}

/**
 * Les etiquettes des etalons du banc (`difficultes` de tests/fixtures/facades/, des cles que le banc et son script de recherche lisent) :
 * a l'ecran elles gardent leur forme (les traits d'union) et prennent leurs accents.
 */
const ETIQUETTES: Readonly<Record<string, string>> = {
  'completion': 'complétion', 'degrade': 'dégradé', 'ebrasements': 'ébrasements', 'faitage-debordant': 'faîtage-débordant', 'hauteur-estimee': 'hauteur-estimée',
  'meuliere': 'meulière', 'ombre-debord': 'ombre-débord', 'pied-cache': 'pied-caché', 'vegetation': 'végétation', 'visee-decentree': 'visée-décentrée',
};

/** Une etiquette d'etalon telle que l'ecran la montre : « pied-cache » → « pied-caché » ; une etiquette inconnue reste la sienne. */
export function etiquetteEcran(etiquette: string): string {
  return Object.hasOwn(ETIQUETTES, etiquette) ? (ETIQUETTES[etiquette] as string) : etiquette;
}

/**
 * Les textes entiers ecrits sans accents la ou ils sont des donnees : la regle d'un constat (app/audit/parcelle/reglesLidar.ts,
 * gardee dans les arbitrages d'un fichier d'audit) et la description d'un etalon du banc (tests/fixtures/facades/, corpus fige).
 */
const PHRASES: Readonly<Record<string, string>> = {
  'ouvertures detectees sur la photo (contours, coins trouves)': 'ouvertures détectées sur la photo (contours, coins trouvés)',
  'Mur de pierre calcaire de 50 cm : chaque baie en retrait de 40 cm, ses quatre ebrasements perpendiculaires au mur. Pris tres de biais (35°), a hauteur d\'oeil des fenetres du rez-de-chaussee : les aretes des ebrasements fuient vers la normale du mur et, pres de l\'horizon, paraissent presque horizontales (le piege des points de fuite lus sur les fenetres).':
    'Mur de pierre calcaire de 50 cm : chaque baie en retrait de 40 cm, ses quatre ébrasements perpendiculaires au mur. Pris très de biais (35°), à hauteur d’œil des fenêtres du rez-de-chaussée : les arêtes des ébrasements fuient vers la normale du mur et, près de l’horizon, paraissent presque horizontales (le piège des points de fuite lus sur les fenêtres).',
};

/** Un identifiant pris dans une phrase : jamais dans un mot, un chemin (`regles/toits/…`), un nom de fichier ou un autre identifiant. */
const DANS_UNE_PHRASE: readonly [RegExp, string][] = Object.keys(MOTS)
  .sort((a, b) => b.length - a.length)
  .map((id) => [new RegExp(String.raw`(?<![\p{L}\d_/.'’-])` + id + String.raw`(?![\p{L}\d_/-]|\.\p{L})`, 'gu'), MOTS[id] as string]);

/** Les tournures que la chaine compose avec des nombres ou des libelles de source, corrigees a l'ecran. */
const TOURNURES: readonly [RegExp, string][] = [
  // « Photo de façade seul ne décide pas » : la source est au feminin (la raison, elle, est comparee telle quelle par tauxAuto.ts).
  [/\bPhoto de façade seul ne décide pas\b/g, 'Photo de façade seule ne décide pas'],
  // La focale rangee d'une photo (É3) : « 27.2 mm éq. » → « 27,2 mm éq. ». Aucun autre nombre n'est touche (versions, modeles de Claude).
  [/(\d)\.(\d+)(?= mm éq\.)/g, '$1,$2'],
  // L'apostrophe droite entre deux lettres devient celle du reste de l'audit.
  [/(?<=\p{L})'(?=\p{L})/gu, '’'],
];

/**
 * Un texte de la chaine des facades ou d'un arbitrage, tel que l'ecran le montre : les textes entiers connus (PHRASES), puis les
 * identifiants pris dans la phrase, la virgule de la focale et l'apostrophe. Ce qui n'est pas dans ces tables ne change pas.
 */
export function texteEcran(texte: string): string {
  if (Object.hasOwn(PHRASES, texte)) return PHRASES[texte] as string;
  let t = texte;
  for (const [motif, ecrit] of DANS_UNE_PHRASE) t = t.replace(motif, ecrit);
  for (const [motif, ecrit] of TOURNURES) t = t.replace(motif, ecrit);
  return t;
}

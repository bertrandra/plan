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
export const NOTE_PROMPT = `Partie fixe du prompt « béton » (spec-regles-toits.md §14.3, spec-audit.md §13.2), envoyée en system et mise en cache. Tout ce qui suit la ligne de tirets part tel quel. Un changement de texte change la version, qui suit chaque ligne du journal. Version 1 (lot L17) : les façades aussi — photos par façade, rendu du modèle depuis la même prise de vue, ouvertures détectées par Plan, détails et matériau du parement. Toujours sans exemples annotés : ils viendront du corpus validé (§14.3, point 5). Version 2 (15 octobre 2026) : le texte ne change pas, mais le schéma de la réponse le suit dans le même bloc system (deploy/analyse.php::promptAvecSchema) au lieu de partir en sortie structurée, dont l'API refusait la grammaire. Version 3 (16 octobre 2026) : sans rendu joint, le texte le dit et le modèle n'en cite aucun (il décrivait « le rendu du modèle » qu'il n'avait pas reçu) ; un mur d'un bâtiment qui en a plusieurs de même orientation porte le numéro de son côté (« est (côté 3) »), une entrée de \`facades\` par étiquette. Version 4 (17 octobre 2026) : les pignons d'abord — la silhouette du haut de chaque façade (triangle, trapèze, rampe, marches, ligne droite) est lue sur la photo et sur le rendu, et c'est elle qui dit la forme du toit et ses bouts ; tout désaccord de silhouette entre le rendu et la photo va dans \`ecarts\`. Le rendu d'une façade est coupé à cette façade (ni dépendance devant le mur, ni aile contre ses bouts) et porte le contour noir des murs, du pignon et du toit.`;

/** La note de l'en-tete du schema. */
export const NOTE_SCHEMA = `Sortie structuree de l'analyse d'une maison par Claude (spec-regles-toits.md 14.2 et 14.3 ; spec-audit.md 13.2). Vocabulaire ferme des paragraphes 2 et 3, indetermine partout, indices avant la conclusion. Version 1 (lot L17) : les facades aussi (ouvertures par niveau, manquees ou en trop par la detection, details, materiau du parement). Le schema part a la suite du prompt (plus dans output_config.format depuis le 15 octobre 2026 : l'API refusait sa grammaire), et la reponse y est ramenee par le serveur (deploy/analyse.php::conformer) ; un changement de champ ou de terme change la version, qui suit chaque ligne du journal.`;

/** Les versions du CORPS du prompt, la plus recente en dernier. Une ligne de plus a chaque changement de texte. */
export const VERSIONS_PROMPT: readonly VersionTexte[] = [
  { version: 4, empreinte: '4b4451da' },
];

/** Les versions du schema (serialise par `textuel`), la plus recente en dernier. */
export const VERSIONS_SCHEMA: readonly VersionTexte[] = [
  { version: 1, empreinte: '785f4411' },
];

export const versionCourante = (l: readonly VersionTexte[]): VersionTexte => l[l.length - 1] as VersionTexte;

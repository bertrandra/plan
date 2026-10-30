// Les versions du prompt et du schema de la lecture du reglement du PLU (usage `plu`, lot L4), tenues comme celles de l'analyse d'une
// maison et du run d'une facade (regles/sujets/versions.ts) : un texte change monte la version, qui suit chaque ligne du journal et
// chaque lecture enregistree dans un projet (`LecturePlu.prompt`, `.schema`). Un fichier a part pour que les lots qui touchent aux
// autres usages n'y touchent pas.

import type { VersionTexte } from '../sujets/versions.js';

export const NOTE_PROMPT_PLU = `Partie fixe du prompt de la lecture du règlement d'une zone du PLU (lot L4 de la lecture IA élargie, MD/spec-lecture-ia-elargie.md §L4), envoyée en system et mise en cache. Tout ce qui suit la ligne de tirets part tel quel. Un changement de texte change la version, qui suit chaque ligne du journal et chaque lecture enregistrée dans un projet. Version 1 (29 octobre 2026) : un extrait PDF du règlement à partir du chapitre de la zone ; Claude relève les hauteurs (égout, faîtage, absolue, annexes), les reculs (voie, limites), l'emprise au sol, les espaces verts, le stationnement, les pentes et couvertures de toit, les couleurs, les clôtures et les annexes, chacune avec son article, sa citation mot pour mot et sa page ; une personne vérifie chaque ligne avant que Plan ne s'en serve.`;

export const NOTE_SCHEMA_PLU = `Sortie de la lecture du reglement d'une zone du PLU par Claude (lot L4). Vocabulaire ferme des grandeurs, des unites et des couvertures ; \`indetermine\` pour une valeur ou une page que le texte ne donne pas. Avec la sortie structuree, le schema part en output_config.format ; sans elle, le serveur montre \`exemple\` avec la consigne \`consigne\`, propre a cet usage. La reponse y est ramenee par le serveur (deploy/analyse-fonctions.php::conformer). Version 1 : zone, regles (grandeur, valeur, unite, termes, condition, article, citation, page, confiance), remarques.`;

export const VERSIONS_PROMPT_PLU: readonly VersionTexte[] = [
  { version: 1, empreinte: 'ba972af0' },
];

export const VERSIONS_SCHEMA_PLU: readonly VersionTexte[] = [
  { version: 1, empreinte: '34f602cc' },
];

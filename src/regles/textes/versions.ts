// Les versions du prompt et du schema de la redaction d'un texte du dossier (usage `texte`, lot L5), tenues comme celles de la lecture
// du PLU (regles/plu/versions.ts) : un texte change monte la version, qui suit chaque ligne du journal et chaque brouillon garde dans un
// projet (`BrouillonTexte.prompt`, `.schema`). Un fichier a part pour que les lots qui touchent aux autres usages n'y touchent pas.

import type { VersionTexte } from '../sujets/versions.js';

export const NOTE_PROMPT_TEXTE = `Partie fixe du prompt de la rédaction d'une pièce écrite de la déclaration préalable (lot L5 de la lecture IA élargie, MD/spec-lecture-ia-elargie.md §5.4), envoyée en system et mise en cache. Tout ce qui suit la ligne de tirets part tel quel. Un changement de texte change la version, qui suit chaque ligne du journal et chaque brouillon gardé dans un projet. Version 1 (30 octobre 2026) : une requête par pièce (description du cerfa, notice descriptive, insertion paysagère), sur les faits du projet en JSON ; Claude rédige un brouillon sans rien inventer ni affirmer de conformité, et dit ce que les faits ne donnent pas ; la personne le relit et le valide avant qu'il n'entre dans le dossier.`;

export const NOTE_SCHEMA_TEXTE = `Sortie de la redaction d'une piece du dossier par Claude (lot L5) : le texte et ses reserves. Avec la sortie structuree, le schema part en output_config.format ; sans elle, le serveur montre \`exemple\` avec la consigne \`consigne\`, propre a cet usage. La reponse y est ramenee par le serveur (deploy/analyse-fonctions.php::conformer). Version 1 (30 octobre 2026) : texte, reserves.`;

export const VERSIONS_PROMPT_TEXTE: readonly VersionTexte[] = [
  { version: 1, empreinte: 'ed6a79bd' },
];

export const VERSIONS_SCHEMA_TEXTE: readonly VersionTexte[] = [
  { version: 1, empreinte: 'b2f373fa' },
];

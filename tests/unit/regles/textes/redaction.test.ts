import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { genererRedactionTexte } from '../../../../src/regles/sujets/generation.js';
import { empreinteTexte, versionCourante } from '../../../../src/regles/sujets/versions.js';
import { VERSIONS_PROMPT_TEXTE, VERSIONS_SCHEMA_TEXTE } from '../../../../src/regles/textes/versions.js';
import { REDACTION_TEXTE } from '../../../../src/regles/textes/redaction.js';
import { LONGUEUR_MAX_DESCRIPTION, PIECES_TEXTE } from '../../../../src/regles/textes/dossier.js';

// La redaction d'un texte du dossier (usage `texte`, lot L5) : ses deux fichiers livres sont ceux que le code donne, sous une version
// qui suit le texte ; chaque champ du schema et chaque piece est definie dans le prompt ; l'exemple du repli a la forme du schema.

const g = genererRedactionTexte();

describe('la redaction d un texte du dossier (deploy/prompt-texte.md, deploy/schema-texte.json)', () => {
  it('est ce que sa description donne, sous une version qui suit le texte', () => {
    expect(readFileSync('deploy/prompt-texte.md', 'utf8') === g.prompt, '`npm run regles:generer`').toBe(true);
    expect(readFileSync('deploy/schema-texte.json', 'utf8') === g.schema, '`npm run regles:generer`').toBe(true);
    expect(empreinteTexte(g.corpsPrompt), 'le prompt a change : une ligne de plus a VERSIONS_PROMPT_TEXTE').toBe(versionCourante(VERSIONS_PROMPT_TEXTE).empreinte);
    expect(empreinteTexte(g.schema), 'le schema a change : une ligne de plus a VERSIONS_SCHEMA_TEXTE').toBe(versionCourante(VERSIONS_SCHEMA_TEXTE).empreinte);
  });

  it('definit dans le prompt chaque champ de son schema et chaque piece, et la longueur de la description du cerfa', () => {
    const champs = Object.keys((REDACTION_TEXTE.schema as { properties: Record<string, unknown> }).properties);
    expect(champs).toEqual(['texte', 'reserves']);
    for (const t of [...champs, ...PIECES_TEXTE]) expect(g.corpsPrompt, t).toContain('`' + t + '`');
    expect(g.corpsPrompt).toContain('Au plus ' + LONGUEUR_MAX_DESCRIPTION + ' caractères');
    // Ce que le prompt interdit : inventer, affirmer une conformite, parler de l'etat du bati (decisions 8 et 10, risque 10).
    expect(g.corpsPrompt).toMatch(/Jamais de conformité affirmée/);
    expect(g.corpsPrompt).toMatch(/Rien sur l'état du bâti/);
  });

  it('porte un exemple de reponse qui a la forme du schema, et la consigne de son repli', () => {
    const f = JSON.parse(g.schema) as { schema: { required: string[]; additionalProperties: boolean }; exemple: Record<string, unknown>; consigne: string };
    expect(Object.keys(f.exemple)).toEqual(f.schema.required);
    expect(typeof f.exemple.texte).toBe('string');
    expect(Array.isArray(f.exemple.reserves)).toBe(true);
    expect(f.schema.additionalProperties).toBe(false);
    expect(f.consigne).toMatch(/projet inventé/);
  });
});

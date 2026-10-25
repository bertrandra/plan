import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { genererFichiers } from '../../../../src/regles/sujets/generation.js';
import { assemblerPrompt, assemblerSchema } from '../../../../src/regles/sujets/assembler.js';
import { DESCRIPTIONS_SUJETS } from '../../../../src/regles/sujets/liste.js';
import { empreinteTexte, versionCourante, VERSIONS_PROMPT, VERSIONS_SCHEMA } from '../../../../src/regles/sujets/versions.js';
import { controler } from '../../../../src/regles/sujets/edition.js';
import type { DescriptionSujet } from '../../../../src/regles/sujets/description.js';

// Le prompt et le schema d'analyse ne s'ecrivent plus a la main : ils sont assembles depuis les
// descriptions de sujets (src/regles/sujets/). Ces tests tiennent deploy/ egal a ce que le code donne,
// et la version egale au texte (un texte change sous la meme version est refuse).

const g = genererFichiers();

describe('deploy/ est ce que les descriptions de sujets donnent', () => {
  it('le prompt livre est celui que le code assemble : `npm run regles:generer` sinon', () => {
    expect(readFileSync('deploy/prompt-analyse.md', 'utf8') === g.prompt).toBe(true);
  });

  it('le schema livre est celui que le code assemble', () => {
    expect(readFileSync('deploy/schema-analyse.json', 'utf8') === g.schema).toBe(true);
  });

  it('un texte change monte la version : l’empreinte du corps est celle de la derniere version', () => {
    expect(empreinteTexte(g.corpsPrompt), 'le prompt a change : ajouter une ligne a VERSIONS_PROMPT (version + 1) et la note de l’en-tete').toBe(versionCourante(VERSIONS_PROMPT).empreinte);
    expect(empreinteTexte(g.schema), 'le schema a change : ajouter une ligne a VERSIONS_SCHEMA (version + 1)').toBe(versionCourante(VERSIONS_SCHEMA).empreinte);
    expect(g.versionPrompt).toBe(versionCourante(VERSIONS_PROMPT).version);
    expect(g.versionSchema).toBe(versionCourante(VERSIONS_SCHEMA).version);
  });
});

describe('les descriptions de sujets', () => {
  it('ont des identifiants uniques, et des champs que le schema exige tous', () => {
    const ids = DESCRIPTIONS_SUJETS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of DESCRIPTIONS_SUJETS) expect(s.id).toMatch(/^[a-z][a-zA-Z0-9-]*$/);
    const schema = JSON.parse(g.schema) as { schema: { required: string[]; properties: Record<string, unknown> } };
    expect(schema.schema.required).toEqual(Object.keys(schema.schema.properties));
    expect(Object.keys(schema.schema.properties)).toEqual(DESCRIPTIONS_SUJETS.flatMap((s) => Object.keys(s.champs)));
  });

  it('ne portent plus d’attributs : le module de meme identifiant dit lequel se mesure', () => {
    for (const s of DESCRIPTIONS_SUJETS) expect(s, s.id).not.toHaveProperty('attributs');
  });

  it('définissent chaque terme de leur schéma dans le prompt (aucune alerte des contrôles)', () => {
    expect(controler(DESCRIPTIONS_SUJETS).filter((c) => c.niveau !== 'ok')).toEqual([]);
  });

  it('expliquent chaque champ du schema dans une consigne', () => {
    for (const s of DESCRIPTIONS_SUJETS) {
      const texte = s.consignes.map((c) => c.texte).join('\n');
      for (const champ of Object.keys(s.champs)) expect(texte, s.id + ' : ' + champ).toContain('`' + champ);
    }
  });

  it('ne partagent aucun rang dans une meme liste : l’ordre du prompt est sans ambiguite', () => {
    const rangs = (f: (s: DescriptionSujet) => { rang: number }[]) => DESCRIPTIONS_SUJETS.flatMap(f).map((b) => b.rang);
    const unique = (l: number[]) => expect(new Set(l).size).toBe(l.length);
    unique(rangs((s) => s.consignes));
    unique(rangs((s) => s.confusions));
    unique(rangs((s) => s.lectures));
    unique(rangs((s) => s.rappels));
    unique(rangs((s) => s.grille));
    const vocabulaire = DESCRIPTIONS_SUJETS.flatMap((s) => s.vocabulaire).map((b) => b.rang);
    unique(vocabulaire);
  });
});

describe('ajouter un sujet', () => {
  const chienAssis: DescriptionSujet = {
    id: 'chienAssis', libelle: 'Chiens-assis',
    champs: { chienAssis: { type: 'object', additionalProperties: false, required: ['indices', 'nombre'], properties: { indices: { $ref: '#/$defs/indices' }, nombre: { $ref: '#/$defs/compte' } } } },
    definitions: {},
    consignes: [{ rang: 5.5, texte: '- `chienAssis` : le nombre de chiens-assis vus sur le versant.' }],
    vocabulaire: [{ section: 'Ouvertures et saillies', rang: 10.5, texte: '- **Chien-assis** : lucarne à un pan en pente inverse du versant.' }],
    lectures: [], grille: [],
    confusions: [{ rang: 10, texte: '**Chien-assis ou fenêtre de toit.** Le chien-assis fait saillie ; la fenêtre de toit est dans le plan du versant.' }],
    rappels: [],
  };
  const avec = [...DESCRIPTIONS_SUJETS.slice(0, -1), chienAssis, DESCRIPTIONS_SUJETS[DESCRIPTIONS_SUJETS.length - 1] as DescriptionSujet];

  it('une description et une ligne : le prompt et le schema le portent, a leur rang, sans renumeroter le reste', () => {
    const p = assemblerPrompt(avec);
    expect(p).toContain('- `chienAssis` : le nombre de chiens-assis');
    // La consigne s'intercale apres `lucarnes` (rang 5) et avant `cheminees` (rang 6).
    expect(p.indexOf('- `lucarnes`')).toBeLessThan(p.indexOf('- `chienAssis`'));
    expect(p.indexOf('- `chienAssis`')).toBeLessThan(p.indexOf('- `cheminees`'));
    // La confusion arrive en dixieme, apres les neuf d'avant.
    expect(p).toMatch(/\n10\. \*\*Chien-assis ou fenêtre de toit\.\*\*/);
    expect(p).toMatch(/\n9\. \*\*Toiture végétalisée ou arbre\.\*\*/);
    const s = assemblerSchema(avec, { version: 1, note: '' }) as { schema: { required: string[]; properties: Record<string, unknown> } };
    expect(s.schema.required).toContain('chienAssis');
    // Le schema suit l'ordre de la liste des sujets (avant `transverse`), le prompt l'ordre des rangs.
    const noms = Object.keys(s.schema.properties);
    expect(noms.indexOf('chienAssis')).toBe(noms.indexOf('ecarts') - 1);
  });

  it('sans le sujet ajouté, rien d’autre ne change : le prompt est celui du fichier livré', () => {
    expect(assemblerPrompt(DESCRIPTIONS_SUJETS)).toBe(g.corpsPrompt);
  });
});

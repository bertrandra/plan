import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { genererFacadeEnrichie, genererFacadeToit, genererFichiers, genererRunFacade, genererRunJardin } from '../../../../src/regles/sujets/generation.js';
import { assemblerPrompt, assemblerSchema } from '../../../../src/regles/sujets/assembler.js';
import { DESCRIPTIONS_SUJETS } from '../../../../src/regles/sujets/liste.js';
import { empreinteTexte, versionCourante, VERSIONS_PROMPT, VERSIONS_PROMPT_FACADE, VERSIONS_SCHEMA, VERSIONS_SCHEMA_FACADE, VERSIONS_PROMPT_JARDIN, VERSIONS_SCHEMA_JARDIN, VERSIONS_PROMPT_FACADE_ENRICHIE, VERSIONS_SCHEMA_FACADE_ENRICHIE, VERSIONS_PROMPT_FACADE_TOIT, VERSIONS_SCHEMA_FACADE_TOIT } from '../../../../src/regles/sujets/versions.js';
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

describe('le run d’une façade (deploy/prompt-facade.md, deploy/schema-facade.json)', () => {
  const f = genererRunFacade();

  it('est ce que sa description donne, sous une version qui suit le texte', () => {
    expect(readFileSync('deploy/prompt-facade.md', 'utf8') === f.prompt).toBe(true);
    expect(readFileSync('deploy/schema-facade.json', 'utf8') === f.schema).toBe(true);
    expect(empreinteTexte(f.corpsPrompt), 'le prompt du run a change : une ligne de plus a VERSIONS_PROMPT_FACADE').toBe(versionCourante(VERSIONS_PROMPT_FACADE).empreinte);
    expect(empreinteTexte(f.schema), 'le schema du run a change : une ligne de plus a VERSIONS_SCHEMA_FACADE').toBe(versionCourante(VERSIONS_SCHEMA_FACADE).empreinte);
  });

  it('definit dans le prompt chaque champ et chaque terme de son schema', () => {
    const termes = new Set<string>(), champs = new Set<string>();
    const parcourir = (v: unknown): void => {
      if (Array.isArray(v)) { v.forEach(parcourir); return; }
      if (!v || typeof v !== 'object') return;
      const o = v as Record<string, unknown>;
      if (Array.isArray(o.enum)) for (const t of o.enum) termes.add(String(t));
      if (o.properties && typeof o.properties === 'object') for (const k of Object.keys(o.properties)) champs.add(k);
      Object.values(o).forEach(parcourir);
    };
    parcourir((JSON.parse(f.schema) as { schema: unknown }).schema);
    // Un champ s'ecrit seul (`u0`) ou sous son parent (`calage.angles`).
    for (const t of [...termes, ...champs]) expect(f.corpsPrompt, t).toMatch(new RegExp('[`.]' + t.replace(/[-]/g, '\\-') + '[`.]'));
  });
});

describe('la lecture enrichie d’une façade (deploy/prompt-facade-enrichie.md, deploy/schema-facade-enrichie.json, lot L1)', () => {
  const f = genererFacadeEnrichie();

  it('est ce que sa description donne, sous une version qui suit le texte', () => {
    expect(readFileSync('deploy/prompt-facade-enrichie.md', 'utf8') === f.prompt).toBe(true);
    expect(readFileSync('deploy/schema-facade-enrichie.json', 'utf8') === f.schema).toBe(true);
    expect(empreinteTexte(f.corpsPrompt), 'le prompt de la lecture enrichie a change : une ligne de plus a VERSIONS_PROMPT_FACADE_ENRICHIE').toBe(versionCourante(VERSIONS_PROMPT_FACADE_ENRICHIE).empreinte);
    expect(empreinteTexte(f.schema), 'le schema de la lecture enrichie a change : une ligne de plus a VERSIONS_SCHEMA_FACADE_ENRICHIE').toBe(versionCourante(VERSIONS_SCHEMA_FACADE_ENRICHIE).empreinte);
  });

  it('definit dans le prompt chaque champ et chaque terme de son schema, sans union ni champ facultatif', () => {
    const termes = new Set<string>(), champs = new Set<string>();
    const parcourir = (v: unknown): void => {
      if (Array.isArray(v)) { v.forEach(parcourir); return; }
      if (!v || typeof v !== 'object') return;
      const o = v as Record<string, unknown>;
      // La sortie structuree compile le schema : une union ou un champ facultatif l'alourdit (decision du 30 octobre 2026).
      expect(o).not.toHaveProperty('anyOf');
      if (o.properties && typeof o.properties === 'object') expect(o.required).toEqual(Object.keys(o.properties));
      if (Array.isArray(o.enum)) for (const t of o.enum) termes.add(String(t));
      if (o.properties && typeof o.properties === 'object') for (const k of Object.keys(o.properties)) champs.add(k);
      Object.values(o).forEach(parcourir);
    };
    parcourir((JSON.parse(f.schema) as { schema: unknown }).schema);
    for (const t of [...termes, ...champs]) expect(f.corpsPrompt, t).toMatch(new RegExp('[`.]' + t.replace(/[-]/g, '\\-') + '[`.]'));
  });

  it('a un exemple de la forme de son schema', () => {
    const d = JSON.parse(f.schema) as { schema: { properties: Record<string, unknown> }; exemple: Record<string, unknown> };
    expect(Object.keys(d.exemple)).toEqual(Object.keys(d.schema.properties));
  });
});

describe('le toit lu sur une façade (deploy/prompt-facade-toit.md, deploy/schema-facade-toit.json, lot L2)', () => {
  const f = genererFacadeToit();

  it('est ce que sa description donne, sous une version qui suit le texte', () => {
    expect(readFileSync('deploy/prompt-facade-toit.md', 'utf8') === f.prompt).toBe(true);
    expect(readFileSync('deploy/schema-facade-toit.json', 'utf8') === f.schema).toBe(true);
    expect(empreinteTexte(f.corpsPrompt), 'le prompt du toit lu a change : une ligne de plus a VERSIONS_PROMPT_FACADE_TOIT').toBe(versionCourante(VERSIONS_PROMPT_FACADE_TOIT).empreinte);
    expect(empreinteTexte(f.schema), 'le schema du toit lu a change : une ligne de plus a VERSIONS_SCHEMA_FACADE_TOIT').toBe(versionCourante(VERSIONS_SCHEMA_FACADE_TOIT).empreinte);
  });

  it('definit dans le prompt chaque champ et chaque terme de son schema, sans union ni champ facultatif', () => {
    const termes = new Set<string>(), champs = new Set<string>();
    const parcourir = (v: unknown): void => {
      if (Array.isArray(v)) { v.forEach(parcourir); return; }
      if (!v || typeof v !== 'object') return;
      const o = v as Record<string, unknown>;
      // La sortie structuree compile le schema : une union ou un champ facultatif l'alourdit (decision du 30 octobre 2026).
      expect(o).not.toHaveProperty('anyOf');
      if (o.properties && typeof o.properties === 'object') expect(o.required).toEqual(Object.keys(o.properties));
      if (Array.isArray(o.enum)) for (const t of o.enum) termes.add(String(t));
      if (o.properties && typeof o.properties === 'object') for (const k of Object.keys(o.properties)) champs.add(k);
      Object.values(o).forEach(parcourir);
    };
    parcourir((JSON.parse(f.schema) as { schema: unknown }).schema);
    for (const t of [...termes, ...champs]) expect(f.corpsPrompt, t).toMatch(new RegExp('[`.]' + t.replace(/[-]/g, '\\-') + '[`.]'));
  });

  it('a un exemple de la forme de son schema', () => {
    const d = JSON.parse(f.schema) as { schema: { properties: Record<string, unknown> }; exemple: Record<string, unknown> };
    expect(Object.keys(d.exemple)).toEqual(Object.keys(d.schema.properties));
  });

  it('ne touche ni au run ni a la lecture enrichie : leurs fichiers restent ceux de L1 (decision du proprietaire, rien de perdu)', () => {
    expect(versionCourante(VERSIONS_PROMPT_FACADE).version).toBe(2);
    expect(versionCourante(VERSIONS_SCHEMA_FACADE).version).toBe(2);
    expect(versionCourante(VERSIONS_PROMPT_FACADE_ENRICHIE).empreinte).toBe('b74229d1');
    expect(versionCourante(VERSIONS_SCHEMA_FACADE_ENRICHIE).empreinte).toBe('a4568ea5');
  });
});

describe('la lecture du jardin (deploy/prompt-jardin.md, deploy/schema-jardin.json, lot L3)', () => {
  const f = genererRunJardin();

  it('est ce que sa description donne, sous une version qui suit le texte', () => {
    expect(readFileSync('deploy/prompt-jardin.md', 'utf8') === f.prompt).toBe(true);
    expect(readFileSync('deploy/schema-jardin.json', 'utf8') === f.schema).toBe(true);
    expect(empreinteTexte(f.corpsPrompt), 'le prompt du jardin a change : une ligne de plus a VERSIONS_PROMPT_JARDIN').toBe(versionCourante(VERSIONS_PROMPT_JARDIN).empreinte);
    expect(empreinteTexte(f.schema), 'le schema du jardin a change : une ligne de plus a VERSIONS_SCHEMA_JARDIN').toBe(versionCourante(VERSIONS_SCHEMA_JARDIN).empreinte);
  });

  it('definit dans le prompt chaque champ et chaque terme de son schema', () => {
    const termes = new Set<string>(), champs = new Set<string>();
    const parcourir = (v: unknown): void => {
      if (Array.isArray(v)) { v.forEach(parcourir); return; }
      if (!v || typeof v !== 'object') return;
      const o = v as Record<string, unknown>;
      if (Array.isArray(o.enum)) for (const t of o.enum) termes.add(String(t));
      if (o.properties && typeof o.properties === 'object') for (const k of Object.keys(o.properties)) champs.add(k);
      Object.values(o).forEach(parcourir);
    };
    parcourir((JSON.parse(f.schema) as { schema: unknown }).schema);
    // Un champ s'ecrit seul (`u0`) ou sous son parent (`calage.angles`).
    for (const t of [...termes, ...champs]) expect(f.corpsPrompt, t).toMatch(new RegExp('[`.]' + t.replace(/[-]/g, '\\-') + '[`.]'));
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

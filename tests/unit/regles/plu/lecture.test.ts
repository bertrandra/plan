import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { genererLecturePlu } from '../../../../src/regles/sujets/generation.js';
import { empreinteTexte, versionCourante } from '../../../../src/regles/sujets/versions.js';
import { VERSIONS_PROMPT_PLU, VERSIONS_SCHEMA_PLU } from '../../../../src/regles/plu/versions.js';
import { LECTURE_PLU } from '../../../../src/regles/plu/lecture.js';
import { LISTE_GRANDEURS_PLU } from '../../../../src/regles/plu/faits.js';
import { lireReglagesPlu, REGLAGES_PLU } from '../../../../src/regles/plu/reglages.js';

// La lecture du reglement du PLU (usage `plu`, lot L4) : ses deux fichiers livres sont ceux que le code donne, sous une version qui
// suit le texte ; chaque champ et chaque terme du schema est defini dans le prompt ; l'exemple du repli a la forme du schema.

const g = genererLecturePlu();

/** Une valeur a-t-elle la forme d'un schema (le sous-ensemble que le schema de la lecture utilise) ? */
function conforme(v: unknown, s: Record<string, unknown>): boolean {
  if (Array.isArray(s.anyOf)) return (s.anyOf as Record<string, unknown>[]).some((b) => conforme(v, b));
  if (Array.isArray(s.enum)) return (s.enum as unknown[]).includes(v);
  switch (s.type) {
    case 'object': {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
      const p = s.properties as Record<string, Record<string, unknown>>;
      return Object.keys(v).every((k) => k in p) && (s.required as string[]).every((k) => k in v && conforme((v as Record<string, unknown>)[k], p[k]!));
    }
    case 'array': return Array.isArray(v) && v.every((x) => conforme(x, s.items as Record<string, unknown>));
    case 'string': return typeof v === 'string';
    case 'number': return typeof v === 'number';
    case 'integer': return Number.isInteger(v);
    default: return false;
  }
}

describe('la lecture du PLU (deploy/prompt-plu.md, deploy/schema-plu.json)', () => {
  it('est ce que sa description donne, sous une version qui suit le texte', () => {
    expect(readFileSync('deploy/prompt-plu.md', 'utf8') === g.prompt, '`npm run regles:generer`').toBe(true);
    expect(readFileSync('deploy/schema-plu.json', 'utf8') === g.schema, '`npm run regles:generer`').toBe(true);
    expect(empreinteTexte(g.corpsPrompt), 'le prompt a change : une ligne de plus a VERSIONS_PROMPT_PLU').toBe(versionCourante(VERSIONS_PROMPT_PLU).empreinte);
    expect(empreinteTexte(g.schema), 'le schema a change : une ligne de plus a VERSIONS_SCHEMA_PLU').toBe(versionCourante(VERSIONS_SCHEMA_PLU).empreinte);
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
    parcourir(LECTURE_PLU.schema);
    for (const t of [...termes, ...champs]) expect(g.corpsPrompt, t).toMatch(new RegExp('[`.]' + t.replace(/[-]/g, '\\-') + '[`.]'));
    expect([...termes]).toEqual(expect.arrayContaining(LISTE_GRANDEURS_PLU));
  });

  it('porte un exemple de reponse qui a la forme du schema, et la consigne de son repli', () => {
    const f = JSON.parse(g.schema) as { schema: Record<string, unknown>; exemple: unknown; consigne: string };
    expect(conforme(f.exemple, f.schema)).toBe(true);
    expect(conforme({ zone: { libelle: 'UL', trouvee: 'oui' }, regles: [{ grandeur: 'hauteur-egout-max' }], remarques: '' }, f.schema)).toBe(false);
    expect(f.consigne).toMatch(/zone inventée/);
    expect(f.consigne).not.toMatch(/façade/);
  });
});

describe('les reglages du PLU (regles/plu/reglages.json)', () => {
  it('se lisent, et un seuil hors de ses bornes, inconnu ou manquant est refuse', () => {
    expect(REGLAGES_PLU['plu.pagesMax']).toBe(25);
    const brut = JSON.parse(readFileSync('regles/plu/reglages.json', 'utf8')) as { seuils: Record<string, { valeur: number; pourquoi: string }> };
    for (const s of Object.values(brut.seuils)) expect(s.pourquoi.length).toBeGreaterThan(40);
    const avec = (nom: string, valeur: unknown) => ({ ...brut, seuils: { ...brut.seuils, [nom]: { valeur } } });
    expect(() => lireReglagesPlu(avec('plu.pagesMax', 2.5))).toThrow(/pagesMax/);
    expect(() => lireReglagesPlu(avec('plu.toleranceHauteurM', 3))).toThrow(/toleranceHauteurM/);
    expect(() => lireReglagesPlu(avec('plu.inconnu', 1))).toThrow(/inconnu/);
    expect(() => lireReglagesPlu({ format: 'autre' })).toThrow(/format/);
  });
});

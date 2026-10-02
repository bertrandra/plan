import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { DESCRIPTIONS } from '../../../src/app/descriptions.js';
import { EXPOSITION } from '../../../src/app/exposition.js';
import { creerRegistre } from '../../../src/app/commandes.js';

// Le glossaire des commandes (app/descriptions.ts) : chaque commande a une description, dans sa
// declaration ou ici, et le glossaire ne decrit que des commandes qui existent.

const racine = resolve(__dirname, '../../..');
function fichiers(dossier: string): string[] {
  const abs = resolve(racine, dossier);
  return readdirSync(abs).flatMap((n) => statSync(join(abs, n)).isDirectory() ? fichiers(join(dossier, n)) : [join(dossier, n)]);
}
// Les declarations : tout `src/app/` sauf la carte d'exposition, qui nomme chaque commande sans la decrire.
const declarations = fichiers('src/app').filter((f) => f.endsWith('.ts') && !f.endsWith('exposition.ts') && !f.endsWith('descriptions.ts'))
  .map((f) => readFileSync(resolve(racine, f), 'utf8')).join('\n');

/** Une ligne qui declare une commande, sous l'une de ses formes (`cmd.declarer`, `commande(`, `vue(`…). */
const DECLARATION = /(?:\bid: |\b(?:commande|vue|cam|vis|surClic)\((?:'[^']*', )?)$/;

/** La declaration de `id` porte-t-elle sa propre description ? Le texte entre son id et la declaration suivante. */
function decriteDansSaDeclaration(id: string): boolean {
  for (let i = declarations.indexOf("'" + id + "'"); i >= 0; i = declarations.indexOf("'" + id + "'", i + 1)) {
    const debutLigne = declarations.lastIndexOf('\n', i) + 1;
    if (!DECLARATION.test(declarations.slice(debutLigne, i))) continue;
    const suite = declarations.slice(i + id.length + 2);
    const fin = suite.search(/\bid: '|\n\s*(?:cmd\.declarer|commande|vue|cam|vis|surClic)\(/);
    return /\bdescription: /.test(fin < 0 ? suite : suite.slice(0, fin));
  }
  return false;
}

describe('descriptions des commandes', () => {
  it('ne decrit que des commandes de la carte d exposition', () => {
    expect(Object.keys(DESCRIPTIONS).filter((id) => !(id in EXPOSITION))).toEqual([]);
  });

  it('donne une description a chaque commande, ici ou dans sa declaration', () => {
    const sans = Object.keys(EXPOSITION).filter((id) => !DESCRIPTIONS[id] && !decriteDansSaDeclaration(id));
    expect(sans).toEqual([]);
  });

  it('ne double pas une description deja portee par la declaration', () => {
    expect(Object.keys(DESCRIPTIONS).filter(decriteDansSaDeclaration)).toEqual([]);
  });

  it('applique le glossaire a la declaration, sans ecraser une description propre', () => {
    const r = creerRegistre();
    r.declarer({ id: 'objet.dupliquer', libelle: 'Dupliquer', groupe: 'objet', executer: () => {} });
    r.declarer({ id: 'objet.supprimer', libelle: 'Supprimer', groupe: 'objet', description: 'propre', executer: () => {} });
    expect(r.obtenir('objet.dupliquer')?.description).toBe(DESCRIPTIONS['objet.dupliquer']);
    expect(r.obtenir('objet.supprimer')?.description).toBe('propre');
  });
});

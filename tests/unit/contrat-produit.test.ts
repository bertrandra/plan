import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { APP_VERSION, SCHEMA_VERSION } from '../../src/model/version.js';
import { schemaMinimal } from '../../src/model/migrations.js';
import { DEMO_OBJECTS, DEMO_MEASURES } from '../../src/model/demo.js';

// Ce que Plan attend de la plateforme, ecrit par Plan (contrat/SOURCE-PRODUIT.md).
//
// La plateforme stocke les projets de Plan sans en connaitre la forme ; deux choses d'elle
// dependent pourtant du programme, et elles avaient pris du retard sans que rien ne le dise : les
// numeros de schema que le produit Plan accepte (`project_schema_versions`), et le document de
// la demonstration que son monde d'essai seme. Ce fichier les publie ; backprod le recopie et
// verifie, de son cote, qu'il les suit. Ici, on verifie qu'il suit le code.
//
// Pour le regenerer apres un changement voulu : REECRIRE_CONTRAT=1 npx vitest run tests/unit/contrat-produit.test.ts

const chemin = resolve(__dirname, '../../contrat/plan-produit.json');

function attendu() {
  return {
    product: 'plan',
    app_version: APP_VERSION,
    // Tout schema que ce programme peut ecrire : un plan sans releve s'ecrit encore en 1.
    schema_versions: Array.from({ length: SCHEMA_VERSION }, (_, i) => i + 1),
    current_schema_version: SCHEMA_VERSION,
    demo_project: {
      name: 'Parcelle AE 101',
      // Ce que `chargerProjetInitial` enregistre quand il cree la demonstration.
      schema_version: schemaMinimal(DEMO_OBJECTS),
      document: { objects: DEMO_OBJECTS, measures: DEMO_MEASURES }
    }
  };
}

const texte = () => JSON.stringify(attendu(), null, 2) + '\n';

describe('le contrat produit publie pour la plateforme', () => {
  if (process.env.REECRIRE_CONTRAT) writeFileSync(chemin, texte(), 'utf8');

  it('existe', () => {
    expect(existsSync(chemin), 'contrat/plan-produit.json absent : REECRIRE_CONTRAT=1').toBe(true);
  });

  it('suit le code : version, schemas acceptes, document de demonstration', () => {
    const publie = readFileSync(chemin, 'utf8').replace(/\r\n/g, '\n');
    expect(publie === texte(), 'contrat/plan-produit.json en retard sur le code : REECRIRE_CONTRAT=1, puis le recopier dans backprod').toBe(true);
  });

  it('seme une demonstration que toute plateforme a jour accepte', () => {
    const c = attendu();
    expect(c.schema_versions).toContain(c.demo_project.schema_version);
    expect(c.schema_versions).toContain(c.current_schema_version);
  });
});

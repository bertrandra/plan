import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Le lien vers la plateforme (spec-connexion-plateforme §5.5) : Plan renvoie a la coquille pour
// tout ce qui lui appartient, et ne reimplemente aucun de ces ecrans.
//
// L'adresse se construit a partir du slug du locataire, et c'est la que la regle des racines de
// la plateforme se joue : chaque organisation vit a `hostname/<slug>/`. On fige ici la forme,
// parce qu'une adresse fausse ne se voit qu'au clic, et seulement en production.

const source = readFileSync(resolve(__dirname, '../../../src/zones/BarreApplication.tsx'), 'utf8');

/** La meme construction que le composant, pour eprouver la forme sans monter React. */
function adresseProjets(plateforme: string, slug: string | null): string {
  return plateforme.replace(/\/+$/, '') + (slug ? '/' + slug : '') + '/projects';
}

describe('l adresse des projets sur la plateforme', () => {
  it('place le slug du locataire avant le segment reserve', () => {
    expect(adresseProjets('https://www.raillard.org', 'acme')).toBe('https://www.raillard.org/acme/projects');
  });

  it('tombe sur la racine nue quand le locataire n a pas de slug', () => {
    // `tenant.slug` est nullable au contrat : une organisation sans slug est celle de
    // l'exploitant, qui occupe la racine.
    expect(adresseProjets('https://www.raillard.org', null)).toBe('https://www.raillard.org/projects');
  });

  it('ne double pas la barre oblique quand l origine en porte une', () => {
    expect(adresseProjets('https://www.raillard.org/', 'acme')).toBe('https://www.raillard.org/acme/projects');
  });
});

describe('ce que le composant fait, et ne fait pas', () => {
  it('ne montre rien tant que le contexte n a pas repondu', () => {
    // Hors plateforme — sous vitest, ou avant que la porte soit franchie — il n'y a personne a
    // nommer, et un lien vers « les projets de personne » n'a pas de sens.
    expect(source).toContain('if (!c) return null;');
  });

  it('ouvre dans un autre onglet, et sans donner la main a la page ouverte', () => {
    // Un plan non enregistre ne doit pas disparaitre parce qu'on est alle voir ses factures.
    expect(source).toContain('target="_blank"');
    expect(source).toContain('rel="noopener"');
  });

  it('lit le locataire du contexte, jamais une valeur ecrite en dur', () => {
    expect(source).toContain('c.tenant.slug');
    expect(source).not.toMatch(/https:\/\/www\.raillard\.org/);
  });
});

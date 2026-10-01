// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { blocDescription, descriptionProduit, ID_DESCRIPTION } from '../../../src/model/produit.js';
import { schemasLisibles } from '../../../src/model/migrations.js';
import { APP_VERSION, SCHEMA_VERSION } from '../../../src/model/version.js';
import { afficherDescription } from '../../../src/app/version.js';

// La plateforme lit dans la page ce que Plan accepte (`project_schema_versions`) : la description
// doit suivre le programme, jamais une liste tenue a la main.

describe('la description du produit', () => {
  it('dit le code, la version et les schemas lus', () => {
    expect(descriptionProduit('plan')).toEqual({ product: 'plan', app_version: APP_VERSION, schema_versions: schemasLisibles() });
  });

  it('lit de 1 au schema courant, sans trou', () => {
    expect(schemasLisibles()).toEqual(Array.from({ length: SCHEMA_VERSION }, (_, i) => i + 1));
  });

  it('se pose comme une donnee que le navigateur n execute pas, retrouvable par son id', () => {
    const b = blocDescription('plan');
    expect(b).toMatch(new RegExp('^<script type="application/json" id="' + ID_DESCRIPTION + '">'));
    const json = /<script[^>]*>([\s\S]*)<\/script>/.exec(b)?.[1] ?? '';
    expect(JSON.parse(json)).toEqual(descriptionProduit('plan'));
  });

  it('ne peut pas fermer son bloc', () => {
    expect(blocDescription('</script><b>')).not.toContain('</script><b>');
    expect(JSON.parse(/<script[^>]*>([\s\S]*)<\/script>$/.exec(blocDescription('</script>'))?.[1] ?? '').product).toBe('</script>');
  });
});

describe('/?version', () => {
  it('montre le bloc de la page, tel quel', () => {
    document.head.innerHTML = '<script type="application/json" id="plan-produit">{"product":"plan","app_version":"9.9.9","schema_versions":[1]}</script>';
    const texte = afficherDescription();
    expect(JSON.parse(texte)).toEqual({ product: 'plan', app_version: '9.9.9', schema_versions: [1] });
    expect(document.getElementById('descriptionProduit')?.textContent).toBe(texte);
  });
});

// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { inventorierEcran } from '../../../src/app/inventaireEcran.js';
import { construireArbre, aplatir } from '../../../src/app/controleurs.js';
import { EXPOSITION } from '../../../src/app/exposition.js';
import type { Section } from '../../../src/ui/champs/types.js';

// L'inventaire « hors registre » : les controles affiches qui ne declenchent ni une commande ni un
// champ de l'inspecteur, et les fonctions d'objet que la demo ne contient pas.

function page(html: string): Document {
  document.body.innerHTML = html;
  return document;
}

describe('inventaire de l ecran', () => {
  it('garde les controles non rattaches, avec zone, cle, nom et sorte', () => {
    const doc = page(`
      <div id="zoneBarre">
        <button data-commande="projet.enregistrer">Enregistrer</button>
        <details class="menu"><summary>Fichier</summary><ul><li role="menuitem"><button data-commande="fichier.exporterJson">Exporter</button></li></ul></details>
      </div>
      <div id="zoneVues3d"><label class="caseReglage"><input type="checkbox" id="terrasse3dShadows"> Ombre portée</label>
        <input type="range" aria-label="Heure"></div>
      <div id="zoneInspecteur"><details data-section="geometrie"><summary>Géométrie</summary>
        <div class="champ" data-cle="hauteur"><input type="number" aria-label="Hauteur"></div></details></div>
      <div id="zoneResultats"><button title="Supprimer cette cote">×</button>
        <label>Origine <select><option>Extrémité A</option><option>Extrémité B</option></select></label></div>
      <div id="zoneControleurs"><button>Lancer la découverte</button></div>
      <input type="hidden" name="x">
    `);
    const { horsRegistre, rattaches } = inventorierEcran(doc);
    // Enregistrer, Exporter (et son menuitem), le champ Hauteur.
    expect(rattaches).toBe(3);
    expect(horsRegistre).toEqual([
      { zone: 'Z4 Vues 3D', cle: 'terrasse3dShadows', nom: 'Ombre portée', sorte: 'case' },
      { zone: 'Z4 Vues 3D', cle: 'curseur:heure', nom: 'Heure', sorte: 'curseur' },
      { zone: 'Z6 Résultats', cle: 'bouton:supprimer-cette-cote', nom: 'Supprimer cette cote', sorte: 'bouton' },
      { zone: 'Z6 Résultats', cle: 'liste:origine', nom: 'Origine', sorte: 'liste' }
    ]);
  });
});

describe('lignes repetees', () => {
  it('compte une fois les controles d une ligne repetee, sans le nom de l exemplaire ni les compteurs', () => {
    const doc = page(`
      <div id="zoneExplorateur">
        <div role="tablist"><button role="tab">Tout<span data-compte>35</span></button></div>
        <ul>
          <li data-instance="Parcelle AE 101"><button data-nom="Sélectionner l’objet">Parcelle AE 101</button><button aria-label="Masquer Parcelle AE 101"></button></li>
          <li data-instance="Maison"><button data-nom="Sélectionner l’objet">Maison</button><button aria-label="Afficher Maison"></button></li>
        </ul>
      </div>`);
    const { horsRegistre } = inventorierEcran(doc);
    expect(horsRegistre.map((c) => c.cle + '=' + c.nom + (c.repete ? ' ×' + c.repete : ''))).toEqual([
      'onglet:tout=Tout',
      'bouton:selectionner-l-objet=Sélectionner l’objet ×2',
      'bouton:masquer=Masquer … ×1',
      'bouton:afficher=Afficher … ×1'
    ]);
  });
});

describe('branche « Hors registre » de l arbre', () => {
  const fonction: Section = { id: 'objet', titre: 'Objet', champs: [
    { type: 'choix', cle: 'fonction', libelle: 'Fonction', options: () => [
      { valeur: 'terrasse', libelle: 'Terrasse' }, { valeur: 'mobilier', libelle: 'Mobilier' }, { valeur: 'limite', libelle: 'Limite' }
    ], lire: () => 'terrasse', ecrire: () => {} }
  ] };
  const arbre = construireArbre({
    appVersion: '9', commandes: [], exposition: EXPOSITION,
    inspecteur: [{ cle: 'polygon.terrasse', nom: 'Polygone', sections: [fonction], optionsDe: (ch) => ch.options({} as never) }],
    ecran: { rattaches: 10, horsRegistre: [
      { zone: 'Z4 Vues 3D', cle: 'terrasse3dShadows', nom: 'Ombre portée', sorte: 'case' },
      { zone: 'Z4 Canevas', cle: 'bouton:x', nom: 'x', sorte: 'bouton' }
    ] }
  });
  const tous = aplatir(arbre);

  it('range les controles hors registre par zone, sans collision de cles', () => {
    expect(tous.get('plan/horsRegistre/ecran')?.details).toMatchObject({ horsRegistre: '2', rattaches: '10' });
    expect(tous.get('plan/horsRegistre/ecran/Z4-Vues-3D/terrasse3dShadows')).toMatchObject({ nom: 'Ombre portée', genre: 'controle' });
    expect(tous.get('plan/horsRegistre/ecran/Z4-Canevas/bouton:x')).toBeDefined();
  });

  it('liste les fonctions d objet absentes de la demo', () => {
    const absentes = tous.get('plan/horsRegistre/sortesAbsentes')?.enfants?.map((n) => n.cle + '=' + n.nom);
    expect(absentes).toEqual(['mobilier=Mobilier', 'limite=Limite']);
  });
});

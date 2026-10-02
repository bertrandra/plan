// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { inventorierEcran, fusionnerInventaires, ecartsDeZone } from '../../../src/app/inventaireEcran.js';
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

describe('fusion des releves de plusieurs classes d ecran', () => {
  const desel = { zone: 'Z4 Barre de sélection', cle: 'bouton:deselectionner', nom: 'Désélectionner', sorte: 'bouton' };
  const fusion = fusionnerInventaires([
    { classe: 'large', rattaches: 260, horsRegistre: [] },
    { classe: 'moyen', rattaches: 240, horsRegistre: [desel, { zone: 'Z3 Explorateur', cle: 'bouton:masquer', nom: 'Masquer …', sorte: 'bouton', repete: 3 }] },
    { classe: 'compact', rattaches: 250, horsRegistre: [desel, { zone: 'Z3 Explorateur', cle: 'bouton:masquer', nom: 'Masquer …', sorte: 'bouton', repete: 5 }] },
    { classe: 'compact', rattaches: 255, horsRegistre: [desel] }
  ]);

  it('compte un controle une fois, avec les classes ou il s affiche', () => {
    expect(fusion.classes).toEqual(['large', 'moyen', 'compact']);
    expect(fusion.horsRegistre).toHaveLength(2);
    expect(fusion.horsRegistre[0]).toMatchObject({ cle: 'bouton:deselectionner', classes: ['moyen', 'compact'] });
    expect(fusion.horsRegistre[1]).toMatchObject({ repete: 5 });
  });

  it('garde le releve le plus fourni pour les rattaches, sans additionner', () => {
    expect(fusion.rattaches).toBe(260);
  });

  it('dit dans l arbre les classes parcourues, et celles d un controle qui n est pas partout', () => {
    const tous = aplatir(construireArbre({ appVersion: '9', commandes: [], exposition: EXPOSITION, inspecteur: [], ecran: fusion }));
    expect(tous.get('plan/horsRegistre/ecran')?.details?.classes).toBe('bureau, tablette, téléphone');
    expect(tous.get('plan/horsRegistre/ecran/Z4-Barre-de-sélection/bouton:deselectionner')?.details?.classes).toBe('tablette, téléphone');
  });
});

describe('ecarts de zone : un controle affiche ailleurs que la ou il est declare', () => {
  it('signale une commande hors des zones de la carte d exposition, et un controle hors de sa zone', () => {
    const doc = page(`
      <div id="zoneBarre"><button data-commande="projet.enregistrer">ok</button><button data-controle="tiroir.onglet">mal place</button>
        <div class="feuille"><button data-controle="feuille.fermer">×</button></div></div>
      <div id="zoneInspecteur"><button data-commande="projet.enregistrer">mal place</button></div>
      <div id="zoneResultats"><div id="zoneResultatsBarre"><button data-controle="tiroir.onglet">ok, sous-conteneur</button></div></div>
      <input type="file" data-commande="fichier.importerJson">`);
    const e = ecartsDeZone(doc).map((x) => x.cle + ' @ ' + x.affiche);
    expect(e).toEqual(['controle:tiroir.onglet @ Z1 Barre d’application', 'commande:projet.enregistrer @ Z5 Inspecteur']);
  });

  it('remonte les ecarts de chaque classe, une fois chacun, jusqu a l arbre', () => {
    const ecart = { cle: 'controle:tiroir.onglet', affiche: 'Z1 Barre d’application', attendu: 'Z6 Résultats' };
    const f = fusionnerInventaires([
      { classe: 'large', rattaches: 1, horsRegistre: [], ecarts: [ecart] },
      { classe: 'compact', rattaches: 1, horsRegistre: [], ecarts: [ecart] }
    ]);
    expect(f.ecarts).toEqual([ecart]);
    const tous = aplatir(construireArbre({ appVersion: '9', commandes: [], exposition: EXPOSITION, inspecteur: [], ecran: f }));
    expect(tous.get('plan/horsRegistre/ecartsZone')?.details?.nombre).toBe('1');
    expect(tous.get('plan/horsRegistre/ecartsZone/controle:tiroir.onglet')?.details).toEqual({ affiche: 'Z1 Barre d’application', attendu: 'Z6 Résultats' });
  });
});

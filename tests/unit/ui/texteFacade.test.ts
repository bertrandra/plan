import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { etiquetteEcran, motEcran, texteEcran } from '../../../src/ui/texteFacade.js';
import { REGLES_LIDAR } from '../../../src/app/audit/parcelle/reglesLidar.js';
import { RECONCILIATION } from '../../../src/regles/reconciliation.js';
import { textePrecision } from '../../../src/facade/releve/analyseSerie.js';

// Les textes de l'audit des facades et de la calibration a l'ecran (le reste du lot 4) : la donnee garde son ecriture (elle
// s'enregistre, se compare, part chez Claude), l'ecran l'ecrit en francais correct ; ce qui n'est pas dans la table passe tel quel.

describe('motEcran : un identifiant dans les mots de l’écran', () => {
  it('écrit les identifiants connus avec leurs accents', () => {
    expect(motEcran('fenetre')).toBe('fenêtre');
    expect(motEcran('porte-fenetre')).toBe('porte-fenêtre');
    expect(motEcran('trapeze')).toBe('trapèze');
    expect(motEcran('indetermine')).toBe('indéterminé');
    expect(motEcran('cheminee')).toBe('cheminée');
    expect(motEcran('degres')).toBe('degrés');
  });

  it('laisse passer un mot inconnu, un mot déjà juste et un mot ambigu', () => {
    for (const mot of ['porte', 'garage', 'triangle', 'pignon', 'lucarne', 'm', 'cote', 'ferme', 'rampe', 'Maison', 'toString', '']) expect(motEcran(mot)).toBe(mot);
  });
});

describe('texteEcran : un texte de la chaîne ou d’un arbitrage tel que l’écran le montre', () => {
  it('écrit la raison d’un arbitrage avec ses valeurs en clair, sans changer la donnée', () => {
    expect(texteEcran('Photo de façade seul ne décide pas : Photo de façade : ardoise-ecaille ; Claude : zinc.'))
      .toBe('Photo de façade seule ne décide pas : Photo de façade : ardoise en écaille ; Claude : zinc.');
    expect(texteEcran('Claude seul ne décide pas : Claude : meuliere.')).toBe('Claude seul ne décide pas : Claude : meulière.');
    expect(texteEcran('Les sources se contredisent (3 contre 2,7, il faut ×1,5) : LiDAR HD : trapeze ; Claude : ligne-droite.'))
      .toBe('Les sources se contredisent (3 contre 2,7, il faut ×1,5) : LiDAR HD : trapèze ; Claude : ligne droite.');
  });

  it('écrit les libellés et les unités de regles/reconciliation.json sans que le fichier change', () => {
    expect(RECONCILIATION.attributs.hauteurEgout.libelle).toBe("Hauteur à l'égout");
    expect(texteEcran(RECONCILIATION.attributs.hauteurEgout.libelle)).toBe('Hauteur à l’égout');
    const accord = RECONCILIATION.attributs.sensFaitage.accord;
    expect('unite' in accord && accord.unite).toBe('degres');
    expect(motEcran('degres')).toBe('degrés');
    // Aucun libelle d'attribut ou de source ne garde d'apostrophe droite a l'ecran.
    for (const d of [...Object.values(RECONCILIATION.attributs), ...Object.values(RECONCILIATION.sources)]) expect(texteEcran(d.libelle)).not.toMatch(/\p{L}'\p{L}/u);
  });

  it('écrit la règle d’un constat, gardée sans accents dans les fichiers d’audit', () => {
    expect(REGLES_LIDAR.photo.ouvertures).toBe('ouvertures detectees sur la photo (contours, coins trouves)');
    expect(texteEcran(REGLES_LIDAR.photo.ouvertures)).toBe('ouvertures détectées sur la photo (contours, coins trouvés)');
    // Un nom de seuil, un chemin de regles et une regle deja juste ne bougent pas.
    for (const regle of [REGLES_LIDAR.lidar.egout, REGLES_LIDAR.photo.silhouette, REGLES_LIDAR.photo.hauteur, REGLES_LIDAR.claude.ouvertures, 'RETRAIT_EGOUT_M = 0,5 m', 'valeur forcée']) expect(texteEcran(regle)).toBe(regle);
  });

  it('écrit la virgule de la focale rangée (É3) et aucune autre', () => {
    expect(texteEcran('Photo 1 : sans EXIF : focale supposée (67°). Optique rangée : 27.2 mm éq. (supposée).')).toBe('Photo 1 : sans EXIF : focale supposée (67°). Optique rangée : 27,2 mm éq. (supposée).');
    expect(texteEcran('Avec EXIF (focale 26 mm éq.).')).toBe('Avec EXIF (focale 26 mm éq.).');
    for (const t of ['lecture-5.1.0', 'Claude Haiku 5.5 · prompt 3', 'claude-sonnet-5-5 (≈ 0,0261 $)', 'UL 11.4', 'facade.test.ts']) expect(texteEcran(t)).toBe(t);
  });

  it('écrit l’apostrophe des textes de la chaîne comme le reste de l’audit', () => {
    const precision = textePrecision(40);
    expect(precision).toBe("Cotes précises à environ 2,5 cm : la photo ne voyait le mur qu'à 40 pixels par mètre.");
    expect(texteEcran(precision as string)).toBe('Cotes précises à environ 2,5 cm : la photo ne voyait le mur qu’à 40 pixels par mètre.');
    expect(texteEcran("aucune ouverture n'y est cherchée. Une vue prise d'un autre endroit la dégagerait.")).toBe('aucune ouverture n’y est cherchée. Une vue prise d’un autre endroit la dégagerait.');
    // Une apostrophe qui n'est pas entre deux lettres (une cote en pieds, un guillemet de code) reste.
    expect(texteEcran("'fenetre' : 12' de large")).toBe("'fenetre' : 12' de large");
  });

  it('ne touche ni à un identifiant, ni à un chemin, ni à un nom d’étalon, ni à un mot ambigu', () => {
    for (const t of [
      'regles/toits/silhouettes.json', 'regles/toits/silhouettes.json (longs pans seuls)', '19-vues-haie-haute-baie-cachee', '15-grand-angle-deja-corrige', '29-cul-de-geai-faitage-debordant',
      'pignon, cul-de-geai, demi-croupe, faitage-debordant, brique, biais', 'facade-toit', 'fenetre_toit', 'data-fenetre', 'toit/fenetre.ts', 'Cote méd. (cm)', 'la cote du mur', 'le mur a 9 m',
      'É7 Calage du mur : Coins trouvés sur 1 photo.', 'Maison · façade nord (78650000AE0101)', '2 Allee des Limites 78110 Le Vesinet', '',
    ]) expect(texteEcran(t)).toBe(t);
  });

  it('écrit en entier la description d’un étalon du banc restée sans accents, et laisse les autres', () => {
    const dossier = join(__dirname, '../../fixtures/facades');
    const scenes = readdirSync(dossier).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dossier, f), 'utf8')) as { nom: string; description: string });
    expect(scenes.length).toBeGreaterThanOrEqual(30);
    const sansAccents = /(?<!\p{L})(ebrasements?|tres|fenetres?|aretes?|pres|piege|chaussee|deja|egout|faitage)(?!\p{L})/u;
    for (const s of scenes) {
      const ecran = texteEcran(s.description);
      expect(ecran, s.nom).not.toMatch(sansAccents);
      expect(ecran, s.nom).not.toMatch(/\p{L}'\p{L}/u);
      // Hors l'apostrophe, seule la scene 21 (ecrite sans accents dans le corpus, qui ne change pas) est reecrite.
      if (s.nom !== '21-ebrasements-profonds-biais') expect(ecran).toBe(s.description.replace(/(?<=\p{L})'(?=\p{L})/gu, '’'));
    }
    // Les etiquettes : toutes celles du corpus passent, aucune ne garde un mot sans accents, la cle du corpus ne change pas.
    const etiquettes = [...new Set(scenes.flatMap((s) => (s as unknown as { difficultes: string[] }).difficultes))];
    expect(etiquettes).toContain('pied-cache');
    for (const e of etiquettes) expect(etiquetteEcran(e), e).not.toMatch(/(?<!\p{L})(completion|degrade|ebrasements|faitage|debordant|debord|estimee|meuliere|cache|vegetation|visee|decentree)(?!\p{L})/u);
    expect(etiquetteEcran('pied-cache')).toBe('pied-caché');
    expect(etiquetteEcran('cul-de-geai')).toBe('cul-de-geai');
    const s21 = scenes.find((s) => s.nom === '21-ebrasements-profonds-biais');
    expect(s21?.description).toContain('ses quatre ebrasements perpendiculaires au mur. Pris tres de biais');
    expect(texteEcran(s21?.description ?? '')).toContain('ses quatre ébrasements perpendiculaires au mur. Pris très de biais (35°), à hauteur d’œil des fenêtres du rez-de-chaussée');
  });
});

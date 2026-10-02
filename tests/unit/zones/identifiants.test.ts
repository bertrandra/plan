import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Les ecouteurs hors registre (MD/spec-ihm-mobile.md annexe D). Ils ne deviennent pas des commandes
// dans la migration mobile : les controles changent de place et de forme, jamais d'identifiant,
// parce que c'est par lui que le code les retrouve (`el('…')`, `getElementById`). Ce test tient la
// liste : un identifiant qui disparait du balisage casse un reglage sans qu'aucune commande le dise.

const racine = resolve(__dirname, '../../..');
const tsx = (dossier: string): string[] => readdirSync(dossier).flatMap(n => {
  const p = join(dossier, n);
  return statSync(p).isDirectory() ? tsx(p) : p.endsWith('.tsx') ? [p] : [];
});
const sources = [
  readFileSync(resolve(racine, 'index.html'), 'utf8'),
  ...tsx(resolve(racine, 'src/zones')).map(f => readFileSync(f, 'utf8'))
].join('\n');

export const IDENTIFIANTS_HORS_REGISTRE = [
  // Vue 3D
  'terrasse3dFilaire', 'terrasse3dAllObjects', 'terrasse3dObjectsOpaque', 'terrasse3dTextures', 'terrasse3dShadows',
  'terrasse3dViewSelect', 'vue3dDate', 'vue3dSemaine', 'vue3dHeure', 'vue3dHeureTexte', 'vue3dIntensite',
  'vue3dIntensiteTexte', 'vue3dLumiereAppoint', 'vue3dLieu', 'vue3dSoleilInfo', 'terrasse3dCanvasHost', 'terrasse3dWrap',
  'terrasse3dLoading', 'terrasse3dHint',
  // Visionneuse
  'glbViewerFilaire', 'glbViewerShadows', 'glbViewerFond', 'glbViewerViewSelect', 'glbViewerDate', 'glbViewerSemaine',
  'glbViewerHeure', 'glbViewerHeureTexte', 'glbViewerIntensite', 'glbViewerIntensiteTexte', 'glbViewerLumiereAppoint',
  'glbViewerLieu', 'glbViewerCanvasHost', 'glbViewerEmpty', 'glbViewerLoading', 'glbViewerContent', 'glbViewerHint',
  // Champs fichier caches, options des menus (le magasin les tient ; l'identifiant sert a la fumee)
  'importSvgFile', 'importJsonFile', 'chkReplaceOnImport', 'chkJsonRemplace', 'chkExportSansParcelle',
  'chkDossierEquipements', 'pdfScaleInput', 'orthoOpacite', 'orthoParcelleOpacite',
  // Panneaux du tiroir
  'terrasseBomTable', 'terrasseBomTotals', 'terrasseDebitBox', 'terrasseDebitBoisBox', 'terrasseCoupeWrap',
  'terrasseImplantWrap', 'terrasseChantierWrap', 'terrasseMethodeWrap', 'measureControls', 'measureResultsTable',
  'pluContenu', 'pluGeoportailLien', 'exportBox', 'copierResumeBtn',
  // Z1 hors registre
  'projectSelect'
];

describe('les identifiants des ecouteurs hors registre', () => {
  it('existent toujours dans le balisage', () => {
    const absents = IDENTIFIANTS_HORS_REGISTRE.filter(id => !sources.includes('"' + id + '"') && !sources.includes('\'' + id + '\''));
    expect(absents).toEqual([]);
  });
});

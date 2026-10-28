import { describe, it, expect } from 'vitest';
import { sectionsInspecteur } from '../../../src/ui/champs/sections.js';
import { sectionsResultatsPiscine } from '../../../src/ui/champs/piscine.js';
import { sectionMetragePergola, sectionPrixPergola } from '../../../src/ui/champs/pergola.js';
import { champsVisibles, groupesDeChamps, type ContexteChamps, type Section } from '../../../src/ui/champs/types.js';
import { DEMO_OBJECTS } from '../../../src/model/demo.js';
import { ensureConstruction } from '../../../src/engine/construction.js';
import { nouvelAbri, nouvellePiscine, nouveauTrou } from '../../../src/model/creation.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// L'inventaire decide de l'inspecteur, ouvrage par ouvrage (MD/spec-ouvrages.md, « Décidé, ouvrage
// par ouvrage », 27 octobre 2026) : l'inspecteur ne garde que ce qui sert a concevoir l'ouvrage
// selectionne. Pour chaque ouvrage de la demonstration, plus une pergola, un carport, une piscine et
// une tremie neufs, les sections montrees dans l'ordre (`*` : repliee d'office) et les plis de champs
// (`repli`) de chacune. Un champ ou une section qui revient, ou un pli qui s'ouvre, fait echouer ce test :
// c'est une decision du proprietaire, pas un detail.

const objets = structuredClone(DEMO_OBJECTS) as ObjetPlan[];
for (const n of [nouvelAbri('pergola', { x: 5, y: 5 }, 'pg', 1), nouvelAbri('carport', { x: 8, y: 8 }, 'cp', 1), nouvellePiscine('rectangle', { x: 12, y: 6 }, 'pi', 1), nouveauTrou({ x: 3, y: 3 }, 'tr', 1)]) objets.push(n.obj);
// Un batiment importe de l'IGN et verrouille : la maison de la demonstration, telle que l'import la pose.
const maisonIgn = { ...structuredClone(objets.find(o => o.name === 'Maison')!), key: 'maisonIgn', name: 'Maison IGN', locked: true, bdtopo: { couche: 'batiment' } } as ObjetPlan;
objets.push(maisonIgn);
const parcelle = objets.find(o => o.key === 'parcelle');
// La grille d'altitudes de la demonstration se lit a part (data/) : une pente douce la remplace ici.
{ const r = parcelle?.relief; if (r) r.z = Array.from({ length: r.nx * r.ny }, (_, i) => 30 + (i % 7) / 10); }

/** Ce que les descripteurs demandent, sans le plan : un contexte qui repond « rien » a tout le reste. */
const neutre = new Proxy({}, { get: (_t, k) => (k === 'then' ? undefined : () => null) }) as Record<string | symbol, unknown>;
function contexte(obj: ObjetPlan): ContexteChamps {
  const base: Record<string, unknown> = {
    etat: { objects: objets, highlight: {}, lectureSeule: false, scene: { scale: 10 }, selectedKey: obj.key, parasol: { dateStr: '2026-06-21', minutes: 720, ombreAffichee: false, carteAffichee: false } },
    obj, objets, parcelle, construction: () => ensureConstruction(obj), elevationOf: () => 0, interiorAngleDeg: () => 90, libelleType: () => 'objet', refLabel: () => '',
    commandeUtilisable: () => true, pointage: () => null, cibleAlignement: () => null, dejaRectangle: () => false,
    contexteSoleil: () => ({ latitude: 48.9, longitude: 2.1, date: new Date('2026-06-21T12:00:00Z') })
  };
  return new Proxy(base, { get: (t, k) => (k in t ? t[k as string] : neutre[k]) }) as unknown as ContexteChamps;
}

/** Les sections montrees (celles qui ont un champ visible), `*` pour une section repliee d'office. */
const montrees = (c: ContexteChamps, sections: Section[]) => sections.filter(s => champsVisibles(s, c).length).map(s => s.id + (s.repliee ? '*' : ''));
/** Les plis de champs de chaque section qui en a : leur titre et les cles qu'ils rangent. */
function plis(c: ContexteChamps, sections: Section[]): Record<string, Record<string, string[]>> {
  const out: Record<string, Record<string, string[]>> = {};
  for (const s of sections) {
    for (const g of groupesDeChamps(champsVisibles(s, c))) {
      if (!g.repli) continue;
      ((out[s.id] ??= {})[g.repli] ??= []).push(...g.champs.map(ch => ch.cle));
    }
  }
  return out;
}

const parNom = (nom: string) => { const o = objets.find(x => x.name === nom); if (!o) throw new Error('absent : ' + nom); return o; };
const TEXTURES = { apparence: { Textures: ['textureVerticale', 'textureHorizontale'] } };

/** L'inventaire decide : les sections, puis les plis (en plus des textures, repliees partout ou il y en a). */
const DECIDE: Record<string, { sections: string[]; plis?: Record<string, Record<string, string[]>> }> = {
  'Parcelle AE 101': {
    sections: ['objet', 'parcelle', 'cloture', 'portails', 'relief', 'apparence', 'cotes*', 'coins*'],
    plis: {
      cloture: { 'Clôture côté par côté': ['cote0', 'cote1', 'cote2', 'cote3', 'cote4', 'cote5'] },
      relief: { 'Réglages techniques': ['grille', 'paysage', 'pointsMax', 'zRef'] }
    }
  },
  'Terrasse': {
    sections: ['objet', 'apparence', 'implantation', 'fondation', 'lames', 'structure', 'appuis', 'finitions', 'parametres*', 'cotes*', 'coins*'],
    plis: { finitions: { 'Rive côté par côté': ['rive0', 'rive1', 'rive2', 'rive3', 'rive4', 'rive5'] } }
  },
  'Piscine 1': { sections: ['objet', 'apparence', 'piscine', 'profondeursPiscine', 'abordsPiscine', 'equipementsPiscine', 'securitePiscine', 'cotes*', 'coins*'] },
  'Pergola 1': {
    sections: ['objet', 'apparence', 'pergola', 'noteCalcul', 'cotes*', 'coins*'],
    plis: {
      pergola: {
        'Contrefiches et chevrons': ['avecContrefiches', 'longueurContrefiche', 'sectionContrefiche', 'sectionChevron', 'entraxeChevrons'],
        'Couleurs et longueurs achetables': ['couleurBois', 'couleurToile', 'longueursBois']
      },
      noteCalcul: { 'Hypothèses et vérifications': ['zoneNeige', 'zoneVent', 'altitude', 'terrain', 'obstruction', 'poidsCouverture', 'classeBois', 'classeService', 'calcul-urbanisme'] }
    }
  },
  'Carport 1': {
    sections: ['objet', 'apparence', 'pergola', 'noteCalcul', 'cotes*', 'coins*'],
    plis: {
      pergola: {
        'Contrefiches et chevrons': ['avecContrefiches', 'longueurContrefiche', 'sectionContrefiche', 'sectionChevron', 'entraxeChevrons'],
        'Couleurs et longueurs achetables': ['couleurBois', 'couleurCouverture', 'longueursBois']
      },
      noteCalcul: { 'Hypothèses et vérifications': ['zoneNeige', 'zoneVent', 'altitude', 'terrain', 'obstruction', 'poidsCouverture', 'classeBois', 'classeService', 'calcul-urbanisme'] }
    }
  },
  // La maison de la demonstration est dessinee a la main : verrouillee, elle garde ses cotes et ses coins, replies.
  'Maison': { sections: ['objet', 'fenetres3d*', 'apparence', 'cotes*', 'coins*', 'releve'] },
  'Maison IGN': { sections: ['objet', 'fenetres3d*', 'apparence', 'releve'] },
  'Abri de jardin': { sections: ['objet', 'fenetres3d*', 'apparence', 'cotes*', 'coins*', 'releve'] },
  'Parasol 1': {
    sections: ['objet', 'apparence', 'parasol'],
    plis: { parasol: { 'Date, heure et carte des ombres': ['ombreDate', 'ombreHeure', 'carteAffichee'] } }
  },
  'Chemin Arrière': { sections: ['objet', 'apparence', 'cotes*'] },
  'Dalle beton': { sections: ['objet', 'apparence', 'cotes*', 'coins*'] },
  'Plattebande Rue': { sections: ['objet', 'apparence', 'cotes*', 'coins*'] },
  'Parking': { sections: ['objet', 'apparence', 'cotes*', 'coins*'] },
  'Trou 1': { sections: ['objet', 'apparence', 'trou', 'cotes*', 'coins*'] },
  'Spa': { sections: ['objet', 'apparence'] },
  'Chêne': { sections: ['objet', 'apparence', 'arbre'] },
  'AE 103': { sections: ['objet', 'parcelle', 'apparence'] },
  'Coin entrant terrasse': { sections: ['objet', 'apparence', 'pointDeVue'] }
};

describe('l inventaire de l inspecteur, ouvrage par ouvrage (decision du 27 octobre 2026)', () => {
  for (const [nom, attendu] of Object.entries(DECIDE)) {
    it(nom + ' : ses sections et ses plis', () => {
      const o = parNom(nom);
      const c = contexte(o);
      const sections = sectionsInspecteur(c);
      expect(montrees(c, sections)).toEqual(attendu.sections);
      const avecTextures = sections.some(s => s.id === 'apparence' && champsVisibles(s, c).some(ch => ch.cle === 'textureVerticale'));
      expect(plis(c, sections)).toEqual({ ...(avecTextures ? TEXTURES : {}), ...(attendu.plis ?? {}) });
    });
  }

  it('ne montre nulle part la matiere, la priorite d affichage ni l alignement par rotation', () => {
    for (const nom of Object.keys(DECIDE)) {
      const c = contexte(parNom(nom));
      const sections = sectionsInspecteur(c);
      const cles = sections.flatMap(s => champsVisibles(s, c).map(ch => s.id + '.' + ch.cle));
      expect(cles.filter(k => k === 'objet.matiere' || k === 'objet.priority')).toEqual([]);
      expect(sections.map(s => s.id)).not.toContain('alignement');
    }
  });

  it('sort de la parcelle la declaration prealable, le voisinage 3D et les doublons du menu Affichage', () => {
    const c = contexte(parcelle!);
    const sections = sectionsInspecteur(c);
    expect(sections.map(s => s.id)).not.toContain('declaration');
    expect(sections.map(s => s.id)).not.toContain('voisinage3d');
    const relief = sections.find(s => s.id === 'relief')!;
    expect(relief.champs.map(ch => ch.cle).filter(k => k === 'sol3d' || k === 'courbes')).toEqual([]);
    // « Actualiser » reste a portee, hors du pli des reglages techniques.
    expect(champsVisibles(relief, c).find(ch => ch.cle === 'actualiser')?.repli).toBeUndefined();
  });

  it('laisse au tiroir le metrage, le chiffrage et les prix d une piscine et d un abri', () => {
    const piscine = contexte(parNom('Piscine 1'));
    expect(sectionsResultatsPiscine(piscine).map(s => s.id)).toEqual(['resultatsPiscine', 'chiffragePiscine', 'prixPiscine']);
    expect(sectionsResultatsPiscine(piscine)[0]!.champs.map(ch => ch.cle)).toEqual(['volume', 'distances', 'taxe']);
    const pergola = contexte(parNom('Pergola 1'));
    expect(champsVisibles(sectionMetragePergola(pergola), pergola).length).toBeGreaterThan(0);
    expect(champsVisibles(sectionPrixPergola(pergola), pergola).every(ch => ch.type === 'nombre')).toBe(true);
    for (const nom of ['Piscine 1', 'Pergola 1', 'Carport 1', 'Terrasse']) {
      const ids = sectionsInspecteur(contexte(parNom(nom))).map(s => s.id);
      expect(ids.filter(id => ['metragePergola', 'prixPergola', 'chiffragePiscine', 'prixPiscine', 'optimisation'].includes(id))).toEqual([]);
    }
  });
});

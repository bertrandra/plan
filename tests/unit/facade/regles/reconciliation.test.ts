import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { accorde, arbitrer, arbitrerTout, direValeur, type Constat, type EtatProjet } from '../../../../src/facade/regles/reconciliation.js';
import { RECONCILIATION, lireReconciliation } from '../../../../src/regles/reconciliation.js';
import type { IdAttribut, SourceConstat } from '../../../../src/regles/reconciliation.js';

// Le moteur d'arbitrage (MD/spec-reconciliation.md §3) : des constats d'un meme attribut, une decision automatique quand
// elle est sure, manuelle sinon, et toujours sa raison. Les poids viennent de regles/reconciliation.json.

const fichier = (): Record<string, unknown> & { attributs: Record<string, Record<string, unknown>> } => JSON.parse(readFileSync('regles/reconciliation.json', 'utf8'));
const projet = (valeur: EtatProjet['valeur'] = null, choisi = false): EtatProjet => ({ valeur, choisi });
const c = (source: SourceConstat, valeur: Constat['valeur'], confiance: number | null = 0.9, plus: Partial<Constat> = {}): Constat => ({ cible: 'batiment:maison', attribut: 'hauteurEgout', source, valeur, confiance, ...plus });
const arb = (constats: Constat[], etat = projet(5), attribut: IdAttribut = 'hauteurEgout') => arbitrer(constats, etat, attribut, 'batiment:maison');

describe('l’accord de deux valeurs', () => {
  const nombre = RECONCILIATION.attributs.hauteurEgout.accord, angle = RECONCILIATION.attributs.sensFaitage.accord;
  it('à une tolérance pour une cote, modulo 180 pour un angle, exactement pour un mot, comme ensemble pour des bouts', () => {
    expect(accorde(6.2, 6.6, nombre)).toBe(true);
    expect(accorde(6.2, 6.8, nombre)).toBe(false);
    expect(accorde(174, 2, angle)).toBe(true);
    expect(accorde(10, 40, angle)).toBe(false);
    expect(accorde('deux-pans', 'deux-pans', { type: 'egal' })).toBe(true);
    expect(accorde('deux-pans', 'croupes', { type: 'egal' })).toBe(false);
    expect(accorde(['pignon', 'croupe'], ['croupe', 'pignon'], { type: 'ensemble' })).toBe(true);
    expect(accorde(['pignon', 'pignon'], ['croupe', 'pignon'], { type: 'ensemble' })).toBe(false);
    expect(accorde('6', 6, nombre)).toBe(false);
  });
  it('se dit en clair', () => {
    expect(direValeur(6.2, nombre)).toBe('6,2 m');
    expect(direValeur(74.3, angle)).toBe('74°');
    expect(direValeur(['pignon', 'croupe'], { type: 'ensemble' })).toBe('pignon + croupe');
    expect(direValeur('croupes', { type: 'egal' }, (m) => m.toUpperCase())).toBe('CROUPES');
    expect(direValeur(null, nombre)).toBe('non renseigné');
  });
});

describe('la décision automatique', () => {
  it('le LiDAR seul, sûr, décide : une hauteur plus basse de 1 m que celle du projet', () => {
    const a = arb([c('lidar', 6)]);
    expect(a.decision).toBe('auto');
    expect(a.retenu?.valeur).toBe(6);
    expect(a.raison).toMatch(/^Une seule source, sûre \(score 3,6\) : LiDAR HD : 6 m\./);
    expect(a.regles).toEqual(['SCORE_AUTO_MIN']);
  });

  it('une photo seule ne décide pas (score 2,7 sous 3), et dit pourquoi', () => {
    const a = arb([c('photo', 6)]);
    expect(a.decision).toBe('manuelle');
    expect(a.raison).toMatch(/Photo de façade seul ne décide pas/);
  });

  it('la photo et l’IGN qui s’accordent décident ensemble (2,7 + 1,8 = 4,5)', () => {
    const a = arb([c('photo', 6.1), c('ign', 6.3)], projet(5));
    expect(a.decision).toBe('auto');
    expect(a.retenu?.sources).toEqual(['ign', 'photo']);
    expect(a.retenu?.valeur).toBeCloseTo(6.18, 2);
    expect(a.raison).toMatch(/^Les sources s’accordent \(score 4,5\)/);
  });

  it('Claude ne décide jamais seul, même très sûr ; avec le LiDAR qui l’appuie, oui', () => {
    const f = (sources: Constat[]) => arbitrer(sources, projet('croupes'), 'formeToit', 'batiment:maison');
    const seul = f([{ ...c('claude', 'deux-pans', 1), attribut: 'formeToit' }]);
    expect(seul.decision).toBe('manuelle');
    expect(seul.raison).toMatch(/Claude seul ne décide pas/);
    const avec = f([{ ...c('claude', 'deux-pans', 1), attribut: 'formeToit' }, { ...c('lidar', 'deux-pans', 0.8), attribut: 'formeToit' }]);
    expect(avec.decision).toBe('auto');
  });

  it('ce que la personne a vu sur place l’emporte sur toutes les autres sources, et décide seule', () => {
    const a = arb([c('terrain', 5.2, null), c('lidar', 6.4), c('photo', 6.5), c('ign', 6.3)], projet(6.4));
    expect(a.decision).toBe('auto');
    expect(a.retenu?.sources).toEqual(['terrain']);
    expect(a.retenu?.valeur).toBe(5.2);
  });

  it('le LiDAR avec un IGN qui diverge l’emporte assez (3,6 contre 1,6) pour décider', () => {
    const a = arb([c('lidar', 6.4), c('ign', 5.2)], projet(5.2));
    expect(a.decision).toBe('auto');
    expect(a.retenu?.valeur).toBe(6.4);
    expect(a.groupes).toHaveLength(2);
  });
});

describe('la décision manuelle', () => {
  it('deux sources de poids voisins qui se contredisent : le LiDAR 6,2 m, la photo 5,0 m', () => {
    const a = arb([c('lidar', 6.2), c('photo', 5)], projet(4));
    expect(a.decision).toBe('manuelle');
    expect(a.groupes.map((g) => [g.sources, g.valeur])).toEqual([[['lidar'], 6.2], [['photo'], 5]]);
    expect(a.raison).toMatch(/^Les sources se contredisent \(3,6 contre 2,7, il faut ×1,5\) : LiDAR HD : 6,2 m ; Photo de façade : 5 m\./);
    expect(a.regles).toEqual(['MARGE_AUTO_MIN']);
  });

  it('une valeur choisie à la main est un veto : aucune source ne la remplace sans la personne', () => {
    const a = arb([c('lidar', 7), c('photo', 7.1)], projet(5, true));
    expect(a.decision).toBe('manuelle');
    expect(a.raison).toMatch(/^Remplace une valeur que vous avez choisie \(5 m\)/);
  });

  it('un score trop bas, même sans rival, est manuel, avec le score qui manque', () => {
    const a = arb([c('ign', 6, 0.5)], projet(5));
    expect(a.decision).toBe('manuelle');
    expect(a.raison).toMatch(/Score insuffisant \(1 pour 3 requis\)/);
    expect(a.regles).toContain('SCORE_AUTO_MIN');
  });
});

describe('rien à proposer', () => {
  it('quand le groupe retenu dit ce que le projet a déjà, à la tolérance près', () => {
    const a = arb([c('lidar', 5.3)], projet(5));
    expect(a.decision).toBe('rien');
    expect(a.raison).toMatch(/Le projet a déjà cette valeur/);
  });
  it('sans aucun constat, ou avec des sources de poids nul', () => {
    expect(arb([]).decision).toBe('rien');
    expect(arb([]).retenu).toBeNull();
    expect(arb([c('lidar', 6, 0)]).decision).toBe('rien');
  });
});

describe('le calcul', () => {
  it('une source qui parle deux fois ne compte que par son constat le plus lourd', () => {
    const a = arb([c('photo', 6, 0.5), c('photo', 6.1, 0.9), c('ign', 6.2)]);
    expect(a.groupes).toHaveLength(1);
    expect(a.retenu?.lignes.filter((l) => l.constat.source === 'photo')).toHaveLength(1);
    expect(a.retenu?.score).toBeCloseTo(3 * 0.9 + 2 * 0.9, 6);
  });

  it('une confiance absente vaut CONFIANCE_ABSENTE', () => {
    expect(arb([c('lidar', 6, null)]).retenu?.score).toBeCloseTo(4 * RECONCILIATION.seuils.CONFIANCE_ABSENTE, 6);
  });

  it('la valeur d’un groupe de cotes est la moyenne pondérée par les scores', () => {
    const a = arb([c('lidar', 6, 0.9), c('photo', 6.4, 0.9)], projet(5));
    expect(a.retenu?.valeur).toBeCloseTo((6 * 3.6 + 6.4 * 2.7) / 6.3, 2);
  });

  it('les poids sont ceux de l’attribut, sinon ceux de la source', () => {
    const regles = lireReconciliation(fichier());
    expect(regles.attributs.silhouetteFacade.poids.photo).toBe(2.5);
    // Un attribut qui ne donne pas de poids a la source : le poids par defaut de la source.
    const json = fichier();
    json.attributs.hauteurEgout!.poids = {};
    const sans = lireReconciliation(json);
    const a = arbitrer([c('lidar', 6)], projet(5), 'hauteurEgout', 'batiment:maison', sans);
    expect(a.retenu?.lignes[0]?.poids).toBe(4);
  });

  it('un seuil propre à l’attribut l’emporte sur celui du fichier', () => {
    const json = fichier();
    json.attributs.hauteurEgout!.scoreAutoMin = 3.8;
    const exigeant = lireReconciliation(json);
    expect(arbitrer([c('lidar', 6)], projet(5), 'hauteurEgout', 'batiment:maison', exigeant).decision).toBe('manuelle');
    expect(arb([c('lidar', 6)]).decision).toBe('auto');
  });

  it('les bouts s’arbitrent comme des ensembles, le sens du faîtage comme un angle', () => {
    const bouts = arbitrer([
      { ...c('photo', ['pignon', 'croupe']), attribut: 'boutsToit' }, { ...c('lidar', ['croupe', 'pignon']), attribut: 'boutsToit' }, { ...c('claude', ['pignon', 'pignon']), attribut: 'boutsToit' },
    ], projet(['pignon', 'pignon']), 'boutsToit', 'batiment:maison');
    expect(bouts.retenu?.sources).toEqual(['lidar', 'photo']);
    expect(bouts.decision).toBe('auto');
    const sens = arbitrer([{ ...c('photo', 73), attribut: 'sensFaitage' }, { ...c('lidar', 80), attribut: 'sensFaitage' }], projet(170), 'sensFaitage', 'batiment:maison');
    expect(sens.groupes).toHaveLength(1);
    expect(sens.decision).toBe('auto');
  });

  it('la règle qui a produit un constat se retrouve dans les règles de la décision (les règles LiDAR font surface)', () => {
    const a = arb([c('lidar', 6, 0.9, { regle: 'ECART_EGOUT_MIN_M' })]);
    expect(a.regles).toEqual(['SCORE_AUTO_MIN', 'ECART_EGOUT_MIN_M']);
  });

  it('arbitrerTout fait un arbitrage par objet et par attribut', () => {
    const tout = arbitrerTout([c('lidar', 6), c('photo', 6), { ...c('lidar', 6), cible: 'batiment:annexe' }, { ...c('claude', 'croupes', 1), attribut: 'formeToit' }], () => projet(5));
    expect(tout.map((a) => a.cible + '/' + a.attribut)).toEqual(['batiment:maison/hauteurEgout', 'batiment:annexe/hauteurEgout', 'batiment:maison/formeToit']);
  });
});

describe('la main de la personne', () => {
  const desaccord = () => [c('lidar', 6), c('ign', 8)];
  const avec = (choix: Parameters<typeof arbitrer>[5]) => arbitrer(desaccord(), projet(5), 'hauteurEgout', 'batiment:maison', RECONCILIATION, choix);

  it('retenir un groupe en fait la décision choisie, avec sa raison', () => {
    const a = avec({ type: 'groupe', index: 1 });
    expect(a.decision).toBe('choisie');
    expect(a.retenu).toBe(a.groupes[1]);
    expect(a.raison).toMatch(/^Retenu par vous : /);
  });
  it('forcer une valeur la pose comme source terrain, hors des groupes', () => {
    const a = avec({ type: 'force', valeur: 7.3 });
    expect(a.decision).toBe('forcee');
    expect(a.retenu?.valeur).toBe(7.3);
    expect(a.groupes.some((g) => g === a.retenu)).toBe(false);
    expect(a.raison).toMatch(/^Forcé par vous : 7,3 m/);
  });
  it('retenir ou forcer ce que le projet a déjà ne propose rien', () => {
    expect(arb([c('lidar', 6)], projet(6)).decision).toBe('rien');
    expect(arbitrer(desaccord(), projet(5), 'hauteurEgout', 'batiment:maison', RECONCILIATION, { type: 'force', valeur: 5.2 }).decision).toBe('rien');
  });
  it('un index inconnu laisse le moteur décider seul', () => {
    expect(avec({ type: 'groupe', index: 9 }).decision).toBe(avec(undefined).decision);
  });
  it('arbitrerTout passe le choix de chaque objet et attribut', () => {
    const [a] = arbitrerTout(desaccord(), () => projet(5), RECONCILIATION, (cible, attribut) => (cible === 'batiment:maison' && attribut === 'hauteurEgout' ? { type: 'force', valeur: 7 } : undefined));
    expect(a?.decision).toBe('forcee');
  });
});

describe('la silhouette des façades décide de la forme du toit', () => {
  const SIL = 'regles/toits/silhouettes.json';
  const f = (source: SourceConstat, valeur: Constat['valeur'], confiance: number, regle?: string): Constat => ({ cible: 'batiment:maison', attribut: 'formeToit', source, valeur, confiance, ...(regle ? { regle } : {}) });

  it('l’emporte sur un LiDAR plus lourd : la photo et Claude disent des croupes, le LiDAR deux pans', () => {
    const a = arbitrer([f('lidar', 'deux-pans', 0.95, 'SEUIL_MARCHE_M'), f('ign', 'deux-pans', 0.8), f('photo', 'croupes', 0.6, SIL), f('claude', 'croupes', 0.8, SIL)], projet('deux-pans'), 'formeToit', 'batiment:maison');
    expect(a.groupes[0]?.valeur).toBe('deux-pans');
    expect(a.retenu?.valeur).toBe('croupes');
    expect(a.decision).toBe('auto');
    expect(a.raison).toContain('la silhouette des façades décide');
  });

  it('ne décide pas seule quand sa source n’a pas le droit d’être seule : la personne tranche, la silhouette proposée', () => {
    const a = arbitrer([f('lidar', 'deux-pans', 0.95, 'SEUIL_MARCHE_M'), f('claude', 'croupes', 0.9, SIL)], projet('deux-pans'), 'formeToit', 'batiment:maison');
    expect(a.retenu?.valeur).toBe('croupes');
    expect(a.decision).toBe('manuelle');
  });

  it('cède à ce qui a été vu sur place', () => {
    const a = arbitrer([f('photo', 'croupes', 0.9, SIL), f('claude', 'croupes', 0.9, SIL), f('terrain', 'deux-pans', 1)], projet('croupes'), 'formeToit', 'batiment:maison');
    expect(a.retenu?.valeur).toBe('deux-pans');
  });

  it('sans silhouette, le LiDAR décide comme avant ; la vue d’ensemble de Claude n’est pas une silhouette', () => {
    const a = arbitrer([f('lidar', 'deux-pans', 0.95, 'SEUIL_MARCHE_M'), f('claude', 'croupes', 0.9, 'forme du toit vue par Claude')], projet('plat'), 'formeToit', 'batiment:maison');
    expect(a.retenu?.valeur).toBe('deux-pans');
  });

  it('est déclarée dans le fichier pour la silhouette de chaque mur, puis la forme, les bouts et le sens du faîtage, pas ailleurs', () => {
    const avec = Object.entries(RECONCILIATION.attributs).filter(([, d]) => d.prioritaires?.length).map(([id]) => id);
    expect(avec.sort()).toEqual(['boutsToit', 'formeToit', 'sensFaitage', 'silhouetteFacade']);
  });
});

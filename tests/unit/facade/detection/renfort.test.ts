import { describe, it, expect } from 'vitest';
import {
  depuisGrille, estReponseRenfort, graduations, signauxRenfort, texteRenfort, texteSignaux, versGrille, voterRenfort,
  type AvisOuverture, type ReponseRenfort,
} from '../../../../src/facade/detection/renfort.js';

// Le renfort de Claude (MD/spec-facades-calage-detection.md §12 bis, lot L18) : quand l'appeler, la
// grille de reperes, la forme de sa reponse et le vote de ses trois passes.

const avis = (numero: number, decision: AvisOuverture['decision'], plus: Partial<AvisOuverture> = {}): AvisOuverture => ({
  indices: [], numero, decision, raison: decision === 'retirer' ? 'ombre' : 'sans-objet', type: 'indetermine', volets: 'indetermine', coffre: 'indetermine', balcon: 'indetermine', forme: 'indetermine', ...plus,
});

const passe = (plus: Partial<ReponseRenfort> = {}): ReponseRenfort => ({
  mur: { indices: [], vu: 'attendu' },
  coins: { indices: [], hautGauche: { colonne: 1, ligne: 2 }, hautDroit: { colonne: 9, ligne: 2 }, basDroit: { colonne: 9, ligne: 8 }, basGauche: { colonne: 1, ligne: 8 } },
  ouvertures: [],
  manquees: [],
  confiance: 'moyenne',
  ...plus,
});

describe('quand appeler Claude', () => {
  it('ne leve rien quand l algorithme est sur de lui', () => {
    expect(signauxRenfort({ calage: { note: 0.8, trouve: true, sources: ['trouve', 'trouve', 'trouve', 'predit'] }, ouvertures: [{ confiance: 0.9 }, { confiance: 0.95 }], devinees: 0, largeurM: 9 })).toEqual([]);
  });

  it('leve les signaux du tableau de la spec', () => {
    expect(signauxRenfort({ calage: { note: 0.3, trouve: false, sources: ['predit', 'predit', 'predit', 'predit'] } })).toEqual(['coins']);
    expect(signauxRenfort({ calage: { note: 0.7, trouve: true, sources: ['trouve', 'trouve', 'predit', 'predit'] } })).toEqual(['coins']);
    expect(signauxRenfort({ cache: 0.35 })).toEqual(['malVue']);
    // Moins de 70 % au-dessus de 0,7, ou une baie devinee en pointille.
    expect(signauxRenfort({ ouvertures: [{ confiance: 0.9 }, { confiance: 0.6 }, { confiance: 0.65 }] })).toContain('peuSure');
    expect(signauxRenfort({ ouvertures: [{ confiance: 0.9 }], devinees: 1 })).toEqual(['peuSure']);
    // Un mur de plus de 4 m sans ouverture : ton sur ton ; une confiance mediane basse aussi.
    expect(signauxRenfort({ ouvertures: [], largeurM: 9 })).toEqual(['tonSurTon']);
    expect(signauxRenfort({ ouvertures: [{ confiance: 0.5 }, { confiance: 0.52 }] })).toEqual(['peuSure', 'tonSurTon']);
    expect(signauxRenfort({ ouvertures: [{ confiance: 0.9 }], attendues: 3 })).toEqual(['desaccord']);
    expect(signauxRenfort({ ouvertures: [{ confiance: 0.9, details: { volets: 'roulant', ferme: true } }] })).toEqual(['details']);
    // Ce que le doigt a pose ne compte pas dans la confiance.
    expect(signauxRenfort({ ouvertures: [{ source: 'ajoutee' }, { confiance: 0.9 }] })).toEqual([]);
    expect(texteSignaux(['coins', 'peuSure'])).toBe('coins non trouvés sur la photo, détection peu sûre');
  });
});

describe('la grille de reperes et la graduation', () => {
  it('passe des pixels aux reperes et retour', () => {
    expect(versGrille({ x: 512, y: 192 }, 1024, 768)).toEqual({ colonne: 5, ligne: 2.5 });
    expect(depuisGrille({ colonne: 5, ligne: 2.5 }, 1024, 768)).toEqual({ x: 512, y: 192 });
    expect(depuisGrille({ colonne: -1, ligne: 11 }, 1000, 1000)).toEqual({ x: -100, y: 1100 });
  });

  it('gradue tous les 50 cm un mur court, tous les metres un long', () => {
    expect(graduations(2)).toEqual([0, 0.5, 1, 1.5, 2]);
    expect(graduations(9.2)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});

describe('la reponse et le vote', () => {
  it('reconnait une reponse du schema du renfort, et pas une de l analyse', () => {
    expect(estReponseRenfort(passe())).toBe(true);
    expect(estReponseRenfort({ forme: { valeur: 'deux-pans', indices: [] } })).toBe(false);
    expect(estReponseRenfort(passe({ manquees: [{ indices: [], type: 'fenetre', x: 1, y: 1, l: Number.NaN, h: 1 }] }))).toBe(false);
  });

  it('vote chaque coin a la mediane des passes d accord, ou le laisse a l algorithme', () => {
    const v = voterRenfort([
      passe(),
      passe({ coins: { indices: [], hautGauche: { colonne: 1.4, ligne: 2.2 }, hautDroit: 'indetermine', basDroit: { colonne: 4, ligne: 8 }, basGauche: { colonne: 1.2, ligne: 8 } } }),
      passe({ coins: { indices: [], hautGauche: { colonne: 1.2, ligne: 2.1 }, hautDroit: 'indetermine', basDroit: { colonne: 6, ligne: 8 }, basGauche: { colonne: 1.1, ligne: 7.9 } } }),
    ]);
    expect(v.coins[0]).toMatchObject({ repere: { colonne: 1.2, ligne: 2.1 }, accord: 1 });
    // Une seule passe le situe : pas de majorite.
    expect(v.coins[1]).toMatchObject({ repere: null });
    // Trois passes, trois positions eloignees : pas d'accord.
    expect(v.coins[2]).toMatchObject({ repere: null });
    expect(v.coins[3]!.repere).toEqual({ colonne: 1.1, ligne: 8 });
  });

  it('vote les avis par numero, une passe muette comptant comme indeterminee', () => {
    const v = voterRenfort([
      passe({ ouvertures: [avis(1, 'garder', { type: 'porte' }), avis(2, 'retirer')] }),
      passe({ ouvertures: [avis(1, 'garder', { type: 'porte' }), avis(2, 'retirer')] }),
      passe({ ouvertures: [avis(1, 'garder')] }),
    ]);
    expect(v.ouvertures.map((a) => [a.numero, a.decision.valeur, a.type.valeur])).toEqual([[1, 'garder', 'porte'], [2, 'retirer', 'indetermine']]);
    expect(v.ouvertures[1]!.decision.accord).toBeCloseTo(2 / 3);
  });

  it('garde une boite manquee vue par deux passes, a la mediane de ses cotes, et ecarte celle d une seule', () => {
    const b = (x: number, y: number) => ({ indices: [], type: 'fenetre' as const, x, y, l: 1.2, h: 1.3 });
    const v = voterRenfort([
      passe({ manquees: [b(1, 1), b(6, 3)] }),
      passe({ manquees: [b(1.2, 0.9)] }),
      passe({ manquees: [b(1.1, 1.1)] }),
    ]);
    expect(v.manquees).toHaveLength(1);
    expect(v.manquees[0]).toMatchObject({ type: 'fenetre', x: 1.1, y: 1, l: 1.2, h: 1.3, accord: 1 });
  });

  it('dit a Claude ce que Plan sait, ouvertures numerotees', () => {
    const t = texteRenfort({ largeurM: 9, hauteurM: 5.6, hauteurMesuree: true, ouvertures: [{ type: 'fenetre', x: 1, y: 1, l: 1.2, h: 1.3, confiance: 0.62 }], grille: { niveaux: [{ appuiM: 1, linteauM: 2.3 }], travees: [{ xM: 1.6, largeurM: 1.2 }] }, signaux: ['peuSure'], coinsTrouves: false, etiquette: 'sud' });
    expect(t).toContain('Façade : sud.');
    expect(t).toContain('Largeur du mur : 9,00 m');
    expect(t).toContain('en tirets');
    expect(t).toContain('détection peu sûre');
    expect(t).toContain('1. fenetre x 1,00 y 1,00 l 1,20 h 1,30 (confiance 62 %)');
  });
});

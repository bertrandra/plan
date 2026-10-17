// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EcranConformite, type AuditsJuges, type PropsEcranConformite } from '../../../src/zones/EcranConformite.js';
import { demandeEcranConformite } from '../../../src/app/ecranConformite.js';
import { mesureConformite, FORMAT_MESURES_CONFORMITE, type MesureConformite, type VerdictCas, type VerdictFacade } from '../../../src/regles/conformite.js';

// L'ecran Admin › Conformité (`?admin&ecran=conformite`, spec-regles-toits §13.5, lot G3) : le
// corpus et les audits recus, le taux et ses axes, les colonnes a venir, la mesure rangee.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const verdict = (p: Partial<VerdictCas>): VerdictCas => ({
  source: 'corpus', fichier: 'audit-le-vesinet.json', id: 'c1', cle: 'vesinet-ae101', statut: 'valide', etat: 'conforme', forme: 'deux-pans', region: '78',
  problemes: [], assertions: [{ assertion: 'attendu', tenue: true }], nonVerifiees: [], ...p,
});
const CORPUS = [
  verdict({}),
  verdict({ fichier: 'audit-hucqueliers.json', cle: 'bati-batiment-37248484', statut: 'a_corriger', etat: 'non-conforme', forme: 'non-notee', region: '62', problemes: ['toit.morceaux'], assertions: [{ assertion: 'probleme', tenue: false, motif: 'toit.morceaux : toujours là' }] }),
];
const AUDIT = verdict({ source: 'audit', fichier: '20261014-100000-abcdef01', id: 'maison', cle: 'maison', statut: null, etat: 'non-conforme', forme: 'mansart', assertions: [{ assertion: 'forme', tenue: false, motif: 'Mansart : forme que Plan ne calcule pas encore', horsCalcul: true }] });
const facade = (p: Partial<VerdictFacade>): VerdictFacade => ({
  fichier: '20261014-100000-abcdef01', batiment: 'Maison', cote: 0, orientation: 'Sud', region: '78',
  baies: { auto: 6, releve: 6, tenu: true }, partVitree: { auto: 0.12, releve: 0.13, tenu: true }, hauteurNiveau: { auto: 2.7, releve: 2.7, tenu: true }, conforme: true, ...p,
});
const FACADES = [
  facade({}),
  facade({ cote: 1, orientation: 'Est', baies: { auto: 6, releve: 0, tenu: false }, partVitree: { auto: 0.12, releve: 0, tenu: false }, hauteurNiveau: { auto: 2.7, releve: null, tenu: null }, conforme: false }),
  facade({ cote: 2, orientation: 'Nord', region: '62' }),
];
const VERSIONS = { code: { version: '2.2.0', commit: null }, lecture: { toits: 1, reglages: '3b9b6b2c', faits: 'e27f2638' } };

describe('l ecran de la conformite', () => {
  let monte: { racine: Root; hote: HTMLElement } | null = null;
  afterEach(() => { if (monte) { const m = monte; act(() => m.racine.unmount()); m.hote.remove(); monte = null; } });

  async function monter(plus: Partial<PropsEcranConformite> = {}) {
    history.replaceState(null, '', '/?admin&ecran=conformite');
    const envoyees: MesureConformite[] = [];
    let historique: MesureConformite[] = [];
    const props: PropsEcranConformite = {
      corpus: CORPUS, versions: VERSIONS,
      chargerAudits: async (progres) => { progres(1, 1); return { verdicts: [AUDIT], lus: 1, illisibles: ['20261001-000000-00000000 : Ce fichier d’audit vient d’une version plus récente de Plan'] } satisfies AuditsJuges; },
      lireHistorique: async () => ({ format: FORMAT_MESURES_CONFORMITE, version: 1, mesures: historique }),
      enregistrer: async (m) => { envoyees.push(m); historique = [...historique, m]; return { mesures: historique.length }; },
      maintenant: () => new Date('2026-10-14T10:00:00Z'),
      ...plus
    };
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    const racine = createRoot(hote);
    await act(async () => { racine.render(createElement(EcranConformite, props)); });
    monte = { racine, hote };
    return { hote, envoyees };
  }
  const texte = (h: HTMLElement, sel: string) => [...h.querySelectorAll(sel)].map((e) => e.textContent?.trim());
  const cliquer = async (b: Element | null | undefined) => { await act(async () => { (b as HTMLElement).click(); }); };

  it('s ouvre par l adresse', () => {
    expect(demandeEcranConformite('?admin&ecran=conformite')).toBe(true);
    expect(demandeEcranConformite('?admin&ecran=consommation')).toBe(false);
  });

  it('montre le taux des deux sources, le critere de la phase 1 et la colonne a venir (Claude)', async () => {
    const { hote } = await monter();
    expect(hote.querySelector('h1')?.textContent).toBe('Conformité');
    const tuiles = texte(hote, '.consTuile');
    expect(tuiles[0]).toContain('33 %');
    expect(tuiles[1]).toContain('3 / 50');
    expect(tuiles[2]).toContain('1 / 10');
    // Sans audit qui ait de facade relevee, la conformite des facades attend ses releves ; l'accord de Claude son lot.
    expect(tuiles[4]).toContain('À venir');
    expect(tuiles[5]).toContain('À venir');
    expect(hote.querySelector('.consEtat')?.textContent).toBe('2 cas du corpus · 1 audit reçu (1 bâtiment)');
    expect(texte(hote, '.consAlertes li')[0]).toContain('version plus récente');
    // Par forme, d'abord : le taux des facades se lit par region, pas par forme.
    expect(texte(hote, '#confVue tbody tr td:first-child')).toEqual(['Deux pans', 'Forme non notée', 'Mansart']);
    expect(texte(hote, '#confVue tbody tr:first-child td:last-child')).toEqual(['—']);
  });

  it('montre la conformite des facades relevees : la tuile, la region, et chaque facade avec ses criteres', async () => {
    const { hote, envoyees } = await monter({ chargerAudits: async () => ({ verdicts: [AUDIT], facades: FACADES, lus: 1, illisibles: [] }) });
    // 2 facades sur 3 tiennent leurs criteres.
    expect(texte(hote, '.consTuile')[4]).toContain('67 %');
    expect(texte(hote, '.consTuile')[4]).toContain('2 conformes sur 3 façades relevées');
    await cliquer(hote.querySelector('#confOnglet-region'));
    // Pas-de-Calais : une facade conforme sur une ; Yvelines : une sur deux.
    const parRegion = Object.fromEntries(texte(hote, '#confVue tbody tr').map((l) => [l?.startsWith('Yvelines') ? '78' : '62', l]));
    expect(parRegion['78']).toMatch(/50 %$/);
    expect(parRegion['62']).toMatch(/100 %$/);
    await cliquer(hote.querySelector('#confOnglet-facades'));
    const f = texte(hote, '#confVue tbody tr');
    expect(f).toHaveLength(3);
    expect(f[0]).toContain('Conforme');
    expect(f[1]).toContain('Non conforme');
    expect(f[1]).toContain('0 / 6 écart');
    expect(f[1]).toContain('non jugé');
    // La source « Corpus » n'a aucune facade relevee.
    const select = hote.querySelector('select[name="source"]') as HTMLSelectElement;
    await act(async () => { select.value = 'corpus'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(hote.querySelector('#confVue .consVide')?.textContent).toContain('Aucune façade relevée');
    await act(async () => { select.value = 'tous'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    // La mesure rangee porte le resume des facades.
    await cliquer([...hote.querySelectorAll('button')].find((b) => b.textContent?.includes('Enregistrer la mesure')));
    expect(envoyees[0]?.facades).toMatchObject({ total: 3, conformes: 2, nonConformes: 1, baies: { tenus: 2, juges: 3 } });
    // L'historique relit la mesure : le taux des facades a cote de celui des toits.
    await cliquer(hote.querySelector('#confOnglet-historique'));
    const ligne = texte(hote, '#confVue tbody tr')[0] ?? '';
    expect(texte(hote, '#confVue thead th')).toContain('Façades');
    expect(ligne).toContain('67 %');
  });

  it('filtre par source, change d onglet, et montre chaque cas avec ce qui ne tient pas', async () => {
    const { hote } = await monter();
    const select = hote.querySelector('select[name="source"]') as HTMLSelectElement;
    await act(async () => { select.value = 'corpus'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(texte(hote, '.consTuile')[0]).toContain('50 %');
    await cliquer(hote.querySelector('#confOnglet-region'));
    expect(texte(hote, '#confVue tbody tr td:first-child')).toEqual(['Pas-de-Calais (62)', 'Yvelines (78)']);
    expect(location.hash).toBe('#region');
    await cliquer(hote.querySelector('#confOnglet-probleme'));
    expect(texte(hote, '#confVue tbody tr td:first-child')).toContain('Découpé en morceaux');
    await act(async () => { select.value = 'tous'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    await cliquer(hote.querySelector('#confOnglet-cas'));
    const lignes = texte(hote, '#confVue tbody tr');
    expect(lignes).toHaveLength(3);
    expect(lignes[2]).toContain('Mansart : forme que Plan ne calcule pas encore');
    await cliquer(hote.querySelector('#confOnglet-claude'));
    expect(texte(hote, '#confVue tbody tr td:first-child')).toEqual(['Couverture', 'Cheminées', 'Toit-terrasse', 'Matériau des murs', 'Teinte des murs', 'Forme du toit']);
  });

  it('enregistre la mesure affichee, toutes sources, et l historique la montre', async () => {
    const { hote, envoyees } = await monter();
    await cliquer(hote.querySelector('#confOnglet-historique'));
    expect(hote.querySelector('#confVue .consVide')?.textContent).toContain('Aucune mesure');
    await cliquer([...hote.querySelectorAll('button')].find((b) => b.textContent?.includes('Enregistrer la mesure')));
    expect(envoyees).toHaveLength(1);
    expect(envoyees[0]).toEqual(mesureConformite({ t: new Date('2026-10-14T10:00:00Z'), ...VERSIONS, corpus: CORPUS, audits: [AUDIT], auditsLus: 1 }));
    expect(hote.querySelector('.confMessage')?.textContent).toBe('Mesure enregistrée sur le serveur.');
    expect(texte(hote, '#confVue tbody tr')[0]).toContain('33 %');
  });

  it('pendant le rejeu des audits, la mesure attend et dit pourquoi ; une erreur se dit', async () => {
    let finir: (j: AuditsJuges) => void = () => {};
    const { hote } = await monter({ chargerAudits: (progres) => { progres(2, 5); return new Promise((ok) => { finir = ok; }); } });
    const bouton = [...hote.querySelectorAll('button')].find((b) => b.textContent?.includes('Enregistrer la mesure')) as HTMLButtonElement;
    expect(bouton.disabled).toBe(true);
    expect(hote.querySelector('.confRaison')?.textContent).toBe('Attendez la fin du rejeu des audits reçus.');
    expect(hote.querySelector('.consEtat')?.textContent).toBe('Rejeu des audits reçus : 2 / 5 bâtiments…');
    await act(async () => { finir({ verdicts: [], lus: 0, illisibles: [] }); });
    expect(bouton.disabled).toBe(false);
    const { hote: h2 } = await (async () => { act(() => monte!.racine.unmount()); monte!.hote.remove(); monte = null; return monter({ chargerAudits: async () => { throw new Error('session admin expirée'); } }); })();
    expect(h2.querySelector('.consErreur')?.textContent).toBe('Audits reçus : session admin expirée');
    expect(texte(h2, '.consTuile')[0]).toContain('50 %');
  });
});

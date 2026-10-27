import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { creerProfilsFacadesFond, rechoisirProfilsFacades, profilARechoisir } from '../../../../src/app/toits/profilsFacadesFond.js';
import { lireReglagesFacades, PROFIL_FACADES_DEFAUT } from '../../../../src/regles/facades/reglages.js';
import type { ObjetPlan, PtBrut } from '../../../../src/model/types.js';
import { versMemoire } from '../../../../src/model/champsFonction.js';

// Le choix des profils de facades en tache de fond (F§15.2, G12) : rien sans profil, la parcelle du
// projet et les batiments verifies jamais rechoisis, une version nouvelle qui fait rechoisir.

const racine = join(__dirname, '../../../..');
const livre = JSON.parse(readFileSync(join(racine, 'regles/facades/reglages.json'), 'utf8')) as Record<string, unknown>;
const essai = (JSON.parse(readFileSync(join(racine, 'tests/fixtures/regles-facades/profils-essai.json'), 'utf8')) as { profils: unknown[] }).profils;
const PROFILS = lireReglagesFacades({ ...livre, profils: essai }).profils;

const p = (x: number, y: number): PtBrut => ({ x, y });
const rect = (x0: number, y0: number, l: number, w: number) => [p(x0, y0), p(x0 + l, y0), p(x0 + l, y0 + w), p(x0, y0 + w)];

function plan(): ObjetPlan[] {
  const parcelle = { key: 'parcelle', type: 'polygon', fonction: 'terrain', pts: rect(-50, -50, 200, 200), cadastre: { idu: '78650000AE0101' } };
  const bat = (key: string, x: number, extra: Record<string, unknown> = {}) => versMemoire({ key, type: 'polygon', fonction: 'batiment', pts: rect(x, 0, 10, 8), bdtopo: { usage1: 'Résidentiel', ...(extra.bdtopo as object ?? {}) }, ...extra });
  return [
    parcelle,
    bat('maison', 0, { bdtopo: { usage1: 'Résidentiel', surParcellePrincipale: true } }),
    bat('voisin', 30),
    bat('verifie', 60, { verifieSurPlace: { date: '2026-10-01' } }),
    bat('annexe', 90, { bdtopo: { usage1: 'Annexe' } }),
  ] as unknown as ObjetPlan[];
}
const parCle = (objets: ObjetPlan[], cle: string) => objets.find((o) => o.key === cle)!;

describe('rechoisirProfilsFacades', () => {
  it('sans profil, chacun garde le defaut : rien ne change ni ne se redessine', () => {
    const objets = plan();
    const b = rechoisirProfilsFacades(objets, { profils: [], version: 1 });
    expect(b.changes).toEqual([]);
  });

  it('choisit le profil du voisinage, jamais celui de la parcelle du projet ni d un batiment verifie', () => {
    const objets = plan();
    expect(profilARechoisir(parCle(objets, 'maison'), 1)).toBe(false);
    expect(profilARechoisir(parCle(objets, 'verifie'), 1)).toBe(false);
    expect(profilARechoisir(parCle(objets, 'parcelle'), 1)).toBe(false);
    const b = rechoisirProfilsFacades(objets, { profils: PROFILS, version: 1 });
    expect(b).toEqual({ changes: ['voisin'], marques: 2 });
    expect(parCle(objets, 'voisin').batiment?.profilFacades).toEqual({ id: 'pavillon-essai', version: 1 });
    expect(parCle(objets, 'annexe').batiment?.profilFacades).toEqual({ id: PROFIL_FACADES_DEFAUT, version: 1 });
    expect(parCle(objets, 'maison').batiment?.profilFacades).toBeUndefined();
    expect(parCle(objets, 'verifie').batiment?.profilFacades).toBeUndefined();
    // Marques : un second passage n'a plus rien a faire.
    expect(rechoisirProfilsFacades(objets, { profils: PROFILS, version: 1 }).marques).toBe(0);
  });

  it('une version nouvelle fait rechoisir ; seuls les profils qui changent sont a redessiner', () => {
    const objets = plan();
    rechoisirProfilsFacades(objets, { profils: PROFILS, version: 1 });
    const b = rechoisirProfilsFacades(objets, { profils: [], version: 2 });
    expect(b).toEqual({ changes: ['voisin'], marques: 2 });
    expect(parCle(objets, 'voisin').batiment?.profilFacades).toEqual({ id: PROFIL_FACADES_DEFAUT, version: 2 });
  });
});

describe('creerProfilsFacadesFond', () => {
  const pause = () => Promise.resolve();

  it('sans profil, ne lance rien et n ecrit rien', async () => {
    const objets = plan();
    const apresLot = vi.fn();
    await creerProfilsFacadesFond({ objets: () => objets, lectureSeule: () => false, apresLot, pause, profils: [], version: 1 }).relancer();
    expect(apresLot).not.toHaveBeenCalled();
    expect(objets.some((o) => o.batiment?.profilFacades)).toBe(false);
  });

  it('en lecture seule, ne lance rien', async () => {
    const objets = plan();
    const apresLot = vi.fn();
    await creerProfilsFacadesFond({ objets: () => objets, lectureSeule: () => true, apresLot, pause, profils: PROFILS, version: 1 }).relancer();
    expect(apresLot).not.toHaveBeenCalled();
  });

  it('choisit par lots, puis s arrete', async () => {
    const objets = plan();
    const apresLot = vi.fn();
    const fond = creerProfilsFacadesFond({ objets: () => objets, lectureSeule: () => false, apresLot, pause, profils: PROFILS, version: 1 });
    await fond.relancer();
    expect(apresLot).toHaveBeenCalledTimes(1);
    expect(apresLot.mock.calls[0]![0]).toEqual({ changes: ['voisin'], marques: 2 });
    expect(fond.enCours()).toBe(false);
  });

  it('arreter interrompt avant le lot suivant', async () => {
    const objets = plan();
    const apresLot = vi.fn();
    let fond: ReturnType<typeof creerProfilsFacadesFond> | null = null;
    fond = creerProfilsFacadesFond({ objets: () => objets, lectureSeule: () => false, apresLot, pause: async () => { fond?.arreter(); }, profils: PROFILS, version: 1 });
    await fond.relancer();
    expect(apresLot).not.toHaveBeenCalled();
  });
});

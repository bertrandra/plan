import { describe, it, expect } from 'vitest';
import { preparerRejeu } from '../../../../../src/app/audit/parcelle/rejeu.js';
import { creerCapture } from '../../../../../src/app/audit/parcelle/capture.js';
import { listeDeControle } from '../../../../../src/app/audit/parcelle/liste.js';
import { normalizeObjects } from '../../../../../src/model/normalisation.js';
import type { FabriqueImages } from '../../../../../src/app/audit/parcelle/entreesAnalyse.js';
import type { ObjetBrut, ObjetPlan, PtBrut } from '../../../../../src/model/types.js';

// Le rejeu de l'analyse d'un audit stocke (MD/spec-audit.md 15.5) : les photos du fichier, sur le
// projet ouvert de la meme parcelle, avec le modele choisi et le depot qui gardera la trace. Le
// renfort n'est pas rejoue ; une autre parcelle est refusee avec sa raison.

const rect = (x0: number, y0: number, x1: number, y1: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const IDU = '78650000AE0101';
const DEPOT = '20261013-154200-0000abcd';
const FAB: FabriqueImages = {
  photo: async (p) => ({ base64: p.base64, mediaType: 'image/jpeg' }),
  rendu: () => null,
  ortho: async () => ({ base64: 'T1JUSE8=', mediaType: 'image/jpeg' }),
  carte: () => null,
  renfort: { photo: async () => { throw new Error('le renfort ne se rejoue pas'); }, elevation: async () => { throw new Error('le renfort ne se rejoue pas'); } },
};

function projet() {
  return normalizeObjects([
    { key: 'parcelle', name: 'parcelle', type: 'polygon', fonction: 'terrain', pts: rect(0, 0, 20, 30), cadastre: { idu: IDU } },
    { key: 'maison', name: 'maison', type: 'polygon', fonction: 'batiment', pts: rect(5, 10, 15, 18), elevation: 6 },
  ] as ObjetBrut[]) as ObjetPlan[];
}

function fichier(objets: ObjetPlan[], idu = IDU): string {
  const cote = listeDeControle(objets, creerCapture(IDU, () => new Date('2026-10-13T09:00:00Z')).lire()).batiments[0]?.facades[0]?.cote ?? 0;
  const photo = (n: number) => ({ type: 'image/jpeg', base64: 'UEhPVE8' + n + '=' });
  return JSON.stringify({
    format: 'plan-audit-parcelle', version: 1, parcelle: { idu, adresse: '2 allée des Limites', origine: null }, code: { version: '2.2.0', commit: null },
    regles: { lectureToits: 1, lectureMurs: 2 }, debut: '2026-10-13T08:00:00.000Z', finCapture: '2026-10-13T08:30:00.000Z', ecritLe: '2026-10-13T09:00:00.000Z',
    batiments: [{ cle: 'maison', nom: 'Maison', mitoyen: false, cas: null, vu: {}, photos: [], facades: [{ cote, orientation: 'Sud', largeurM: 10, hauteurM: 6, photos: [photo(1), photo(2)], mesure: null }] }],
    cloture: { photos: [] }, portail: { photos: [] }, propositions: [], decisions: [],
  });
}

describe('le rejeu de l analyse d un audit stocke', () => {
  it('reprend les photos du fichier, en trois passes, avec le modele choisi et le depot', async () => {
    const objets = projet();
    const d = await preparerRejeu({ texte: fichier(objets), depot: DEPOT, modele: 'claude-sonnet-5-5', objets, iduProjet: IDU, projet: 'p1' }, FAB);
    if ('refus' in d) throw new Error(d.refus);
    expect(d).toMatchObject({ usage: 'rejeu', depot: DEPOT, modele: 'claude-sonnet-5-5', audit: DEPOT, idu: IDU, projet: 'p1' });
    expect(d.requetes.map((r) => r.id)).toEqual(['b0-p1', 'b0-p2', 'b0-p3']);
    // Pas de requete du renfort : l'analyse des maisons seule.
    expect(d.requetes.every((r) => r.usage === undefined)).toBe(true);
    const images = d.requetes[0]?.contenu.filter((b) => b.type === 'image').map((b) => (b.type === 'image' ? b.source.data : ''));
    expect(images).toEqual(['UEhPVE81=', 'UEhPVE82=', 'T1JUSE8=']);
  });

  it('refuse un audit d une autre parcelle, ou sans photo', async () => {
    const objets = projet();
    const ailleurs = await preparerRejeu({ texte: fichier(objets, '35238000AB0001'), depot: DEPOT, modele: 'claude-haiku-5-5', objets, iduProjet: IDU, projet: null }, FAB);
    expect(ailleurs).toEqual({ refus: expect.stringContaining('ouvrez le projet de cette parcelle') });
    const vide = JSON.parse(fichier(objets)) as { batiments: { facades: { photos: unknown[] }[] }[] };
    for (const f of vide.batiments[0]?.facades ?? []) f.photos = [];
    expect(await preparerRejeu({ texte: JSON.stringify(vide), depot: DEPOT, modele: 'claude-haiku-5-5', objets, iduProjet: IDU, projet: null }, FAB)).toEqual({ refus: 'Aucune photo de bâtiment à analyser dans cet audit.' });
  });
});

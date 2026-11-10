import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { jugerAuditsRecus, versionsDuCalcul } from '../../../../src/app/administration/ecranConformite.js';
import { lireFichierPromenade } from '../../../../src/model/audit.js';
import { FORMAT_AUDIT_PARCELLE, VERSION_FICHIER_AUDIT_PARCELLE } from '../../../../src/model/fichierAuditParcelle.js';
import { EMPREINTE_REGLAGES_TOITS } from '../../../../src/regles/toits/reglages.js';
import { APP_VERSION } from '../../../../src/model/version.js';

// Les audits recus, lus sur le serveur puis rejoues dans la page (lot G3) : un audit illisible est
// nomme et saute, les autres sont juges batiment par batiment.

const promenade = lireFichierPromenade(JSON.parse(readFileSync(join(__dirname, '../../../fixtures/audit/audit-2026-10-13-1200-le-vesinet.json'), 'utf8')));
const ae101 = promenade.cas[0]!;
const audit = {
  format: FORMAT_AUDIT_PARCELLE, version: VERSION_FICHIER_AUDIT_PARCELLE,
  parcelle: { idu: '78650000AE0101', adresse: '2 allée des Limites', origine: null },
  code: { version: '2.2.0', commit: null }, regles: { lectureToits: 1, lectureMurs: 2 },
  debut: '2026-10-14T09:00:00Z', finCapture: null, ecritLe: '2026-10-14T10:00:00Z',
  batiments: [{ cle: 'maison', nom: 'Maison', mitoyen: false, cas: { identite: ae101.identite, entrees: ae101.entrees, sorties: ae101.sorties }, vu: { forme: 'croupes' }, photos: [], facades: [] }],
  cloture: { photos: [] }, portail: { photos: [] }, propositions: [], decisions: [],
};

function fauxServeur(): (entree: string) => Promise<Response> {
  const json = (d: unknown) => new Response(JSON.stringify(d), { status: 200, headers: { 'Content-Type': 'application/json' } });
  return async (entree) => {
    if (entree === 'admin/audits') return json({ audits: [{ id: '20261014-100000-abcdef01', recuLe: '2026-10-14T10:00:00Z', organisation: 'admin', idu: '78650000AE0101', adresse: null }, { id: '20261014-110000-00000000', recuLe: '', organisation: 'admin', idu: 'x', adresse: null },
      // Une sauvegarde de capture (§15) : elle n'est pas lue, le corpus n'apprend pas d'une capture inachevee.
      { id: '20261014-120000-0000cafe', recuLe: '2026-10-14T12:00:00Z', organisation: 'org', idu: '78650000AE0101', adresse: null, marque: 'sauvegarde' }] });
    if (entree === 'admin/audits/20261014-100000-abcdef01') return json(audit);
    if (entree === 'admin/audits/20261014-110000-00000000') return json({ ...audit, version: 99 });
    if (entree === 'admin/audits/20261014-120000-0000cafe') throw new Error('une sauvegarde ne se lit pas ici');
    return new Response('{}', { status: 404 });
  };
}

describe('jugerAuditsRecus', () => {
  it('rejoue les batiments des audits lisibles, nomme les autres', { timeout: 30_000 }, async () => {
    const progres: [number, number][] = [];
    const r = await jugerAuditsRecus(fauxServeur(), (fait, total) => progres.push([fait, total]));
    expect(r.lus).toBe(1);
    expect(r.illisibles).toEqual(['20261014-110000-00000000 : Ce fichier d’audit vient d’une version plus récente de Plan : mettez Plan à jour pour le lire.']);
    expect(r.verdicts).toHaveLength(1);
    // AE 101 vu en croupes : le calcul le lit en deux pans, le cas n'est pas conforme.
    expect(r.verdicts[0]).toMatchObject({ source: 'audit', id: 'maison', etat: 'non-conforme', forme: 'croupes', region: '78' });
    expect(r.verdicts[0]?.assertions[0]?.motif).toBe('lu deux-pans');
    expect(progres).toEqual([[0, 1], [1, 1]]);
  });

  it('dit les versions du calcul qui a juge', () => {
    const v = versionsDuCalcul();
    expect(v.code.version).toBe(APP_VERSION);
    expect(v.lecture.reglages).toBe(EMPREINTE_REGLAGES_TOITS);
    expect(typeof v.lecture.toits).toBe('number');
  });
});

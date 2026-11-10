import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lireFichierPromenade, type CasAudit, type FichierPromenade } from '../../../../src/model/audit.js';
import { casDeLAuditParcelle, casDeLaPromenade, corpusConformite, jugerCas, lectureDesCorps, texteCorpusConformite } from '../../../../src/facade/regles/conformite.js';
import { lireCorpusConformite, resumer } from '../../../../src/regles/conformite.js';
import type { FichierAuditParcelle } from '../../../../src/model/fichierAuditParcelle.js';
import corpusLivre from '../../../../regles/conformite.json';

// Le jugement d'un cas sur le code d'aujourd'hui (lot G3), et le fichier du corpus que l'ecran
// Admin › Conformité lit : il doit etre celui que le code rend, sans quoi l'ecran mentirait.

const DOSSIER = join(__dirname, '../../../fixtures/audit');
const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith('.json')).sort()
  .map((nom) => ({ nom, fichier: lireFichierPromenade(JSON.parse(readFileSync(join(DOSSIER, nom), 'utf8'))) }));
const vesinet = fichiers.find((f) => f.nom.includes('vesinet'))?.fichier as FichierPromenade;
const ae101 = vesinet.cas[0] as CasAudit;
const hucqueliers = fichiers.find((f) => f.nom.includes('hucqueliers'))?.fichier as FichierPromenade;
const longere = hucqueliers.cas[0] as CasAudit;

// Chaque rejeu refait le calcul entier d'un batiment (une a trois secondes) : la marge par defaut ne suffit pas.
const observe = (cas: CasAudit, statut = cas.statut) => ({ source: 'corpus' as const, fichier: 'f.json', statut, region: '78', cas });

describe('regles/conformite.json', { timeout: 60_000 }, () => {
  it('est a jour : npx tsx .claude/skills/toits/scripts/conformite.ts --ecrire', () => {
    const attendu = texteCorpusConformite(corpusConformite(fichiers));
    expect(JSON.stringify(corpusLivre, null, 1) + '\n', 'regles/conformite.json en retard sur le code : relancer le script avec --ecrire').toBe(attendu);
  });

  it('se relit, et dit les taux de depart des deux promenades de demonstration', () => {
    const v = lireCorpusConformite(corpusLivre);
    expect(v).toHaveLength(2);
    const r = resumer(v);
    // AE 101 tient son attendu ; le pavillon de la longere d'Hucqueliers est toujours decoupe en morceaux.
    expect(r).toMatchObject({ total: 2, conformes: 1, nonConformes: 1, aRevoir: 0, taux: 0.5 });
    expect(v.find((x) => x.cle === 'vesinet-ae101')).toMatchObject({ etat: 'conforme', forme: 'deux-pans', region: '78' });
    expect(v.find((x) => x.cle === 'bati-batiment-37248484')).toMatchObject({ etat: 'non-conforme', forme: 'non-notee', region: '62', problemes: ['toit.morceaux'] });
  });
});

describe('jugerCas', { timeout: 60_000 }, () => {
  it('AE 101 : l’attendu valide tenu ; vu en deux pans a deux pignons, toujours conforme', () => {
    expect(jugerCas(observe(ae101)).etat).toBe('conforme');
    const v = jugerCas(observe({ ...ae101, vu: { forme: 'deux-pans', bouts: 'pignons', sensFaitage: 'parallele' } }));
    expect(v.etat).toBe('conforme');
    expect(v.assertions.map((a) => a.assertion)).toEqual(['attendu', 'forme', 'bouts']);
    expect(v.nonVerifiees).toEqual(['sensFaitage']);
  });

  it('AE 101 vu a la Mansart, avec des lucarnes : non conforme, hors calcul', () => {
    const v = jugerCas(observe({ ...ae101, attendu: null, vu: { forme: 'mansart', lucarnes: { nombre: 2 } } }));
    expect(v.etat).toBe('non-conforme');
    expect(v.forme).toBe('mansart');
    expect(v.assertions.every((a) => !a.tenue && a.horsCalcul)).toBe(true);
  });

  it('un attendu qui ne tient plus : non conforme, avec ce qui a bouge', () => {
    const v = jugerCas(observe({ ...ae101, attendu: { ...ae101.attendu!, corps: [] } }));
    expect(v.etat).toBe('non-conforme');
    expect(v.assertions[0]?.motif).toContain('corps');
  });

  it('un probleme note : toujours la si le rejeu redonne le terrain, a revoir s’il a change', () => {
    expect(jugerCas(observe(longere)).etat).toBe('non-conforme');
    const change = jugerCas(observe({ ...longere, sorties: { ...longere.sorties, corps: [] } }));
    expect(change.etat).toBe('a-revoir');
    expect(change.assertions[0]?.motif).toContain('à revoir');
  });

  it('un probleme que le rejeu ne refait pas (contour) reste tel que note', () => {
    const v = jugerCas(observe({ ...longere, sorties: { ...longere.sorties, corps: [] }, constat: { ...longere.constat, problemes: ['contour.decale'] } }));
    expect(v.etat).toBe('non-conforme');
  });

  it('sans observation ni probleme : sans observation ; sans suite : ecarte, sans rejeu', () => {
    expect(jugerCas(observe({ ...longere, constat: { ...longere.constat, problemes: [] } })).etat).toBe('sans-observation');
    expect(jugerCas(observe(longere, 'sans_suite')).etat).toBe('ecarte');
  });

  it('la lecture des corps : la forme et les bouts du plus grand corps', () => {
    const l = lectureDesCorps(ae101.attendu!.corps);
    expect(l.forme).toBe('deux-pans');
    expect(l.bouts).toEqual(['pignon', 'pignon']);
    expect(lectureDesCorps(null)).toEqual({ forme: null, bouts: null, lucarnes: 0, cheminees: 0 });
  });
});

describe('les sources', { timeout: 60_000 }, () => {
  it('une promenade : un cas observe par cas, region tiree de l’IDU', () => {
    const cas = casDeLaPromenade('v.json', vesinet);
    expect(cas).toHaveLength(1);
    expect(cas[0]).toMatchObject({ source: 'corpus', fichier: 'v.json', statut: 'valide', region: '78' });
  });

  it('un audit de parcelle : ses batiments figes, « Ce que je vois » comme observation', () => {
    const audit = {
      parcelle: { idu: '78650000AE0101', adresse: null, origine: null }, debut: '2026-10-14T10:00:00Z',
      batiments: [
        { cle: 'maison', nom: 'Maison', mitoyen: false, cas: { identite: ae101.identite, entrees: ae101.entrees, sorties: ae101.sorties }, vu: { forme: 'deux-pans' }, photos: [], facades: [] },
        { cle: 'abri', nom: 'Abri', mitoyen: false, cas: null, vu: {}, photos: [], facades: [] },
      ],
    } as unknown as FichierAuditParcelle;
    const cas = casDeLAuditParcelle('20261014-100000-abcdef01', audit);
    expect(cas).toHaveLength(1);
    const v = jugerCas(cas[0]!);
    expect(v).toMatchObject({ source: 'audit', fichier: '20261014-100000-abcdef01', id: 'maison', statut: null, etat: 'conforme', region: '78' });
  });
});

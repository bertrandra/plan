import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { EXPOSITION } from '../../../src/app/exposition.js';
import { CONTROLES } from '../../../src/app/controlesInterface.js';

// Les photos d'une facade se prennent dans l'audit, et nulle part ailleurs (MD/spec-facade-calage-audit.md, decision 6, lot F6) : le
// releve est devenu l'editeur d'une facade deja relevee, la calibration lit les facades de l'audit. Ce test le tient sur le code : une
// camera ouverte (`getUserMedia`), un champ fichier qui demande la camera (`capture`) ou qui prend une image, n'existent que dans
// les ecrans de l'audit (zones/parcours/). Une prise de vue ajoutee ailleurs fait echouer la CI.

const src = resolve(__dirname, '../../../src');
const fichiers = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? fichiers(p) : /\.tsx?$/.test(n) ? [p] : []; });
const rel = (p: string) => relative(src, p).split(sep).join('/');

/** Ce qui prend une photo : la camera du navigateur, un champ fichier qui la demande, ou qui accepte une image. */
const PRISE = [/getUserMedia/, /\bcapture\s*[:=]\s*['"](environment|user)['"]/, /\baccept\s*[:=]\s*['"]image\//];
/** Les ecrans de l'audit : la parcelle (sa liste, sa prise) et la promenade des toits. */
const AUDIT = ['zones/parcours/AuditParcelle.tsx', 'zones/parcours/AuditCas.tsx'];

describe('aucun ecran de capture hors de l audit', () => {
  it('seuls les ecrans de l audit prennent une photo', () => {
    const prennent = fichiers(src).filter((f) => PRISE.some((r) => r.test(readFileSync(f, 'utf8')))).map(rel).sort();
    expect(prennent).toEqual([...AUDIT].sort());
  });

  it('le releve n a plus de commande ni de controle de capture ; la photo d un mur passe par l audit', () => {
    expect(Object.keys(EXPOSITION)).not.toContain('facade.relever');
    expect(Object.keys(EXPOSITION)).toEqual(expect.arrayContaining(['facade.photographier', 'facade.modifier', 'facade.creerCas']));
    const capture = ['releve.importerPhoto', 'releve.declencher', 'releve.choisirMur', 'releve.methode', 'releve.photoRue', 'releve.objectif', 'releve.analyser', 'releve.ajouterPhoto', 'releve.reprendre', 'calibration.photo', 'calibration.nouveauCas'];
    for (const k of capture) expect(CONTROLES, k).not.toHaveProperty(k);
  });
});

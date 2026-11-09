import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { EXPOSITION } from '../../../src/app/exposition.js';
import { CONTROLES } from '../../../src/app/controlesInterface.js';

// Les photos d'une facade se prennent dans l'audit, et nulle part ailleurs (MD/spec-facade-calage-audit.md, decision 6, lot F6) : le
// releve est devenu l'editeur d'une facade deja relevee, la calibration lit les facades de l'audit. Ce test le tient sur le code : une
// camera ouverte (`getUserMedia`) ou un champ fichier qui la demande (`capture`) n'existent que dans les ecrans de l'audit
// (zones/parcours/). Un champ fichier qui prend une image aussi, a une exception pres : l'editeur d'un cas de la calibration importe des
// photos dans un cas (demande du proprietaire, 9 novembre 2026 : « Dans calibration je peux uploader des photos »), sans camera, et le
// meme champ (`ChampDesPhotos`, exporte par l'editeur) cree un cas depuis des photos sur l'ecran de la calibration (reponse du
// proprietaire, 9 novembre 2026 : « Nouveau cas depuis des photos » oui, la camera toujours dans l'audit seul). Une prise de vue ajoutee
// ailleurs fait echouer la CI.

const src = resolve(__dirname, '../../../src');
const fichiers = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? fichiers(p) : /\.tsx?$/.test(n) ? [p] : []; });
const rel = (p: string) => relative(src, p).split(sep).join('/');

/** Ce qui prend une photo : la camera du navigateur, ou un champ fichier qui la demande. */
const CAMERA = [/getUserMedia/, /\bcapture\s*[:=]\s*['"](environment|user)['"]/];
/** Ce qui importe une image : un champ fichier qui accepte une image. */
const IMPORT = [/\baccept\s*[:=]\s*['"]image\//];
/** Les ecrans de l'audit : la parcelle (sa liste, sa prise) et la promenade des toits. */
const AUDIT = ['zones/parcours/AuditParcelle.tsx', 'zones/parcours/AuditCas.tsx'];
/** L'import de photos dans un cas de calibration (demande du proprietaire, 9 novembre 2026). */
const CALIBRATION = ['zones/EditeurCasCalibration.tsx'];

describe('aucun ecran de capture hors de l audit', () => {
  it('seuls les ecrans de l audit prennent une photo ; la calibration en importe dans un cas, sans camera', () => {
    const lus = fichiers(src).map((f) => ({ f: rel(f), texte: readFileSync(f, 'utf8') }));
    const camera = lus.filter((x) => CAMERA.some((r) => r.test(x.texte))).map((x) => x.f).sort();
    const importent = lus.filter((x) => IMPORT.some((r) => r.test(x.texte))).map((x) => x.f).sort();
    // La camera : l'audit seul. L'import d'une image : l'audit et l'editeur d'un cas de la calibration.
    expect(camera.filter((f) => !AUDIT.includes(f))).toEqual([]);
    expect([...new Set([...camera, ...importent])].sort()).toEqual([...AUDIT, ...CALIBRATION].sort());
  });

  it('le nouveau cas depuis des photos passe par le champ de l editeur, sans camera ni champ a lui', () => {
    const ecran = readFileSync(join(src, 'zones/EcranCalibration.tsx'), 'utf8');
    expect(ecran).toMatch(/<ChampDesPhotos controle="calibration\.fichiersNouveauCas"/);
    expect(ecran).not.toMatch(/type="file"|getUserMedia|\bcapture\b\s*=/);
    expect(CONTROLES).toHaveProperty('calibration.nouveauCasPhotos');
    expect(CONTROLES).toHaveProperty('calibration.fichiersNouveauCas');
    // Le champ partage : accept image, jamais capture.
    const editeur = readFileSync(join(src, 'zones/EditeurCasCalibration.tsx'), 'utf8');
    expect(editeur.match(/type="file"/g)).toHaveLength(1);
    expect(editeur).not.toMatch(/\bcapture\s*=/);
  });

  it('le releve n a plus de commande ni de controle de capture ; la photo d un mur passe par l audit', () => {
    expect(Object.keys(EXPOSITION)).not.toContain('facade.relever');
    expect(Object.keys(EXPOSITION)).toEqual(expect.arrayContaining(['facade.photographier', 'facade.modifier', 'facade.creerCas']));
    const capture = ['releve.importerPhoto', 'releve.declencher', 'releve.choisirMur', 'releve.methode', 'releve.photoRue', 'releve.objectif', 'releve.analyser', 'releve.ajouterPhoto', 'releve.reprendre', 'calibration.photo', 'calibration.nouveauCas'];
    for (const k of capture) expect(CONTROLES, k).not.toHaveProperty(k);
  });
});

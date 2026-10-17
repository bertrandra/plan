import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { chaineVivante, ENTREES_CHAINE, type EntreesChaine } from '../../../src/app/chaineVivante.js';
import { CHAINE, type NoeudChaine } from '../../../src/model/chaine.js';
import { SOURCES, ATTRIBUTS, lireReconciliation } from '../../../src/regles/reconciliation.js';
import { readFileSync } from 'node:fs';

// La chaine lue en direct : ce que disent les fichiers de donnees change l'ecran, ce qui ne se lit plus est dit, et la CI
// refuse un fichier cite qui n'existe plus.

const detail = (c: ReturnType<typeof chaineVivante>, id: string) => c.noeuds.find((n) => n.id === id)?.detail ?? '';
const brut = (): Record<string, unknown> => JSON.parse(readFileSync('regles/reconciliation.json', 'utf8')) as Record<string, unknown>;

describe('la chaine lue en direct', () => {
  it('est a jour : aucun probleme avec les fichiers du depot', () => {
    expect(chaineVivante().problemes).toEqual([]);
  });

  it('cite les poids et les seuils des fichiers, sans les recopier', () => {
    const c = chaineVivante();
    expect(detail(c, 'sources.lidar')).toContain('Poids 4.');
    expect(detail(c, 'sources.photo')).toContain('Poids 3, ne décide pas seul');
    expect(detail(c, 'toit.marches')).toContain('0,8 m');
    expect(detail(c, 'decision.regle')).toContain('atteint 3,');
    expect(c.noeuds.some((n) => /\{\{/.test(n.detail ?? ''))).toBe(false);
  });

  it('un poids qui change dans le fichier change la ligne', () => {
    const f = brut() as { sources: Record<string, { poids: number }> };
    f.sources.lidar!.poids = 9;
    const c = chaineVivante({ ...ENTREES_CHAINE, reconciliation: lireReconciliation(f) });
    expect(detail(c, 'sources.lidar')).toContain('Poids 9.');
    expect(c.problemes).toEqual([]);
  });

  it('un seuil qui change change la ligne et sa valeur', () => {
    const c = chaineVivante({ ...ENTREES_CHAINE, seuils: { ...ENTREES_CHAINE.seuils, SEUIL_MARCHE_M: 1.2 } });
    expect(detail(c, 'toit.marches')).toContain('1,2 m');
    expect(c.noeuds.find((n) => n.id === 'toit.marches')?.lignes?.find((l) => l.nom === 'SEUIL_MARCHE_M')?.valeur).toBe('1,2 m');
  });

  it('un seuil retiré des données est dit, pas caché', () => {
    const reste: Record<string, number> = { ...ENTREES_CHAINE.seuils };
    delete reste.SEUIL_MARCHE_M;
    const c = chaineVivante({ ...ENTREES_CHAINE, seuils: reste });
    expect(c.problemes.some((p) => p.includes('SEUIL_MARCHE_M'))).toBe(true);
  });

  it('une source, un attribut, une étape LiDAR, un sujet et une forme des données ont leur ligne', () => {
    const ids = new Set(chaineVivante().noeuds.map((n) => n.id));
    for (const s of SOURCES) expect(ids.has('sources.' + s), s).toBe(true);
    for (const a of ATTRIBUTS) expect(ids.has('decision.attr.' + a), a).toBe(true);
    for (const e of ENTREES_CHAINE.reconciliation.lecturesLidar) expect(ids.has('toit.lidar.' + e.ordre)).toBe(true);
    for (const s of ENTREES_CHAINE.sujets) expect(ids.has('audit.sujet.' + s.id), s.id).toBe(true);
    for (const f of ENTREES_CHAINE.formes) expect(chaineVivante().noeuds.some((n) => n.forme === f.id), f.id).toBe(true);
  });

  it('une forme ou un sujet ajouté aux données apparaît sans toucher la liste écrite', () => {
    const e: EntreesChaine = { ...ENTREES_CHAINE, formes: [...ENTREES_CHAINE.formes, { id: 'sheds', titre: 'Sheds', famille: 'toit' }], sujets: [...ENTREES_CHAINE.sujets, { id: 'balcon', libelle: 'Balcon', propose: true }] };
    const c = chaineVivante(e);
    expect(c.noeuds.find((n) => n.id === 'o3d.sheds')).toMatchObject({ lu: true, forme: 'sheds', parent: 'objets3d.formes' });
    expect(c.noeuds.find((n) => n.id === 'audit.sujet.balcon')).toMatchObject({ lu: true, mode: 'mixte' });
    // Le catalogue ne la dessine pas encore : l'ecran le dit.
    expect(c.problemes).toEqual([]);
  });

  it('dit une valeur citée qui n’existe plus et une forme retirée du catalogue', () => {
    const noeuds: NoeudChaine[] = [...CHAINE, { id: 'x', parent: 'toit', genre: 'objet', titre: 'x', detail: 'vaut {{seuil.INCONNU}}', forme: 'fantome' }];
    const p = chaineVivante({ ...ENTREES_CHAINE, noeuds }).problemes;
    expect(p.some((x) => x.includes('seuil.INCONNU'))).toBe(true);
    expect(p.some((x) => x.includes('fantome'))).toBe(true);
  });

  it('dit ce que les fichiers disent aujourd’hui', () => {
    const { lecture } = chaineVivante();
    expect(lecture.sources).toBe(SOURCES.length);
    expect(lecture.seuils).toBeGreaterThan(50);
    expect(lecture.empreintes.reconciliation).toMatch(/\S/);
  });
});

describe('la liste écrite à la main ne cite que des fichiers qui existent', () => {
  const fichiers = (ou: string): string[] => ou.split(',').map((x) => x.trim().split('#')[0]!.split(' ')[0]!);
  const existe = (chemin: string): boolean => {
    if (/^(deploy|regles|MD)\//.test(chemin) || chemin.startsWith('src/')) return chemin.includes('*') ? motif('', chemin) : existsSync(chemin);
    const complet = 'src/' + chemin;
    return chemin.includes('*') ? motif('src/', chemin) : existsSync(complet);
  };
  const motif = (racine: string, chemin: string): boolean => {
    const dossier = racine + chemin.slice(0, chemin.lastIndexOf('/'));
    const [debut, fin] = (chemin.slice(chemin.lastIndexOf('/') + 1)).split('*') as [string, string];
    return existsSync(dossier) && readdirSync(dossier).some((f) => f.startsWith(debut) && f.endsWith(fin));
  };
  it('chaque `ou` désigne un fichier du dépôt', () => {
    const absents = chaineVivante().noeuds.flatMap((n) => (n.ou ? fichiers(n.ou).filter((f) => !existe(f)).map((f) => n.id + ' : ' + f) : []));
    expect(absents).toEqual([]);
  });
});

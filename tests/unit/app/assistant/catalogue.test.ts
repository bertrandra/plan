import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { planDeReference } from '../../../fixtures/assistant/plan.js';
import { construireCatalogue, texteCatalogue } from '../../../../src/app/assistant/catalogue.js';
import { EXPOSITION } from '../../../../src/app/exposition.js';
import { creerRegistre, PHRASE_CAPACITE } from '../../../../src/app/commandes.js';

// Le catalogue de l'assistant (lot L6, MD/spec-lecture-ia-elargie.md §4.7) : GENERE par le code, des declarations du registre, de la
// carte d'exposition et des descripteurs de l'inspecteur. Aucune liste d'identifiants n'est ecrite a la main.

const racine = resolve(__dirname, '../../../..');
function fichiers(dossier: string): string[] {
  const abs = resolve(racine, dossier);
  return readdirSync(abs).flatMap((n) => (statSync(join(abs, n)).isDirectory() ? fichiers(join(dossier, n)) : [join(dossier, n)]));
}

describe('le catalogue de l assistant', () => {
  it('prend les commandes que leur declaration ouvre a l assistant, et elles seules', () => {
    const p = planDeReference({ selection: 'terrasse' });
    const cat = construireCatalogue(p.source());
    const ouvertes = p.commandes.lister().filter((c) => c.assistant).map((c) => c.id);
    expect(cat.commandes.map((c) => c.id)).toEqual(ouvertes);
    // Ni l'annulation, ni la suppression (elle pose une question), ni ce qui pointe sur le plan.
    for (const id of ['objet.annuler', 'objet.supprimer', 'projet.reinitialiser', 'objet.ajouter.polygone', 'affichage.orthophoto']) expect(ouvertes).not.toContain(id);
    // Chaque commande ouverte a l'assistant est exposee quelque part dans chaque classe.
    for (const id of ouvertes) for (const classe of ['compact', 'moyen', 'large'] as const) expect(EXPOSITION[id]?.[classe].some((l) => l !== 'sansObjet'), id + ' ' + classe).toBe(true);
  });

  it('ne s ecrit nulle part a la main : le drapeau `assistant` des declarations est la seule source', () => {
    // Le catalogue ne nomme aucune commande dans son code ; le drapeau ne se pose que dans les declarations du registre.
    const code = readFileSync(resolve(racine, 'src/app/assistant/catalogue.ts'), 'utf8');
    expect(code).not.toMatch(/'(objet|affichage|terrasse)\.[a-zA-Z.]+'/);
    const porteurs = fichiers('src/app').filter((f) => f.endsWith('.ts') && /\bassistant: \{/.test(readFileSync(resolve(racine, f), 'utf8')));
    expect(porteurs.sort()).toEqual(['src/app/ecouteurs/affichage.ts', 'src/app/ecouteurs/objets.ts']);
  });

  it('dit l etat de chaque commande et de chaque bascule, et omet ce que l abonnement n offre pas', () => {
    const p = planDeReference({ selection: 'terrasse' });
    const cat = construireCatalogue(p.source());
    expect(cat.commandes.find((c) => c.id === 'affichage.grille')).toMatchObject({ bascule: false, ecrit: 'affichage', etat: { utilisable: true } });
    expect(cat.commandes.find((c) => c.id === 'affichage.nord')).toMatchObject({ bascule: true });
    expect(cat.commandes.find((c) => c.id === 'objet.dupliquer')).toMatchObject({ ecrit: 'projet', etat: { utilisable: true } });
    // Une piscine n'est pas selectionnee : la plage autour se grise, sans phrase (le contexte).
    expect(cat.commandes.find((c) => c.id === 'objet.terrassePiscine')?.etat).toEqual({ utilisable: false, raison: 'contexte' });
    // Une commande effacee (capacite non achetee) n'est pas proposee, comme elle n'est pas a l'ecran.
    const efface = { ...p.source(), etat: (id: string) => (id === 'objet.ajouter.piscine' ? { utilisable: false as const, raison: 'capacite' as const, message: PHRASE_CAPACITE } : p.commandes.etat(id)) };
    expect(construireCatalogue(efface).commandes.map((c) => c.id)).not.toContain('objet.ajouter.piscine');
  });

  it('n ouvre pas une commande que la classe d ecran n expose pas', () => {
    const p = planDeReference({ selection: 'terrasse' });
    const r = creerRegistre();
    r.declarer({ id: 'objet.essaiSansExposition', libelle: 'Essai', groupe: 'objet', assistant: {}, executer: () => {} });
    expect(construireCatalogue({ ...p.source(), commandes: r.lister() }).commandes).toEqual([]);
  });

  it('donne les objets du projet (pas le voisinage), la selection marquee, et les champs de l objet selectionne', () => {
    const p = planDeReference({ selection: 'spa' });
    const cat = construireCatalogue(p.source());
    expect(cat.selection).toEqual({ cle: 'spa', nom: 'Spa' });
    expect(cat.objets.filter((o) => o.selectionne).map((o) => o.cle)).toEqual(['spa']);
    expect(cat.objets.some((o) => o.cle.startsWith('bati-'))).toBe(false);
    expect(cat.champs.find((c) => c.cle === 'objet.elevation')).toMatchObject({ type: 'nombre', unite: 'm', min: 0, valeur: '0', ecrit: 'projet', actif: true });
    expect(cat.champs.find((c) => c.cle === 'equipement.natureEquipement')?.options?.map((o) => o.valeur)).toContain('regard');
    // Les cotes et coins designes au pointeur n'entrent pas : l'etape ecrirait celui que la souris montre a l'instant d'Appliquer.
    expect(cat.champs.some((c) => c.section === 'cotes' || c.section === 'coins')).toBe(false);
  });

  it('dit les preferences d affichage, et grise en lecture seule ce qui ecrit le projet', () => {
    const p = planDeReference({ selection: 'parcelle', lectureSeule: true });
    const cat = construireCatalogue(p.source());
    expect(cat.lectureSeule).toBe(true);
    expect(cat.champs.find((c) => c.cle === 'apparence.gazon3d')).toMatchObject({ ecrit: 'affichage', actif: true });
    expect(cat.champs.find((c) => c.cle === 'cloture.type')).toMatchObject({ ecrit: 'projet', actif: false });
    const t = texteCatalogue(cat);
    expect(t).toMatch(/Lecture seule : oui/);
    expect(t).toMatch(/- `apparence\.gazon3d` \(case ; affichage\) : Gazon \(3D\) = `oui`/);
    expect(t).toMatch(/- `cloture\.type` \(choix ; grisé\) : Type = `palissade` ; options : `aucune` \(Aucune\)/);
  });

  it('s ecrit en texte : commandes et leur etat, objets, champs par section, bornes et options', () => {
    const t = texteCatalogue(construireCatalogue(planDeReference({ selection: 'terrasse' }).source()));
    expect(t).toMatch(/^# Catalogue de Plan \(version 1\)\n\nÉcran : bureau\. Lecture seule : non\./);
    expect(t).toMatch(/- `affichage\.grille` : Grille — .*\. Bascule d’affichage : actuellement MASQUÉ, absent de l’écran ; l’exécuter l’affiche\. État : utilisable\./);
    expect(t).toMatch(/- `objet\.terrassePiscine` : .*État : refusée : Indisponible dans l’état actuel du plan\.\n/);
    expect(t).toMatch(/- `terrasse` : « Terrasse » \(terrasse\) — sélectionné/);
    expect(t).toMatch(/### 3\. Lames et sens de pose \(`lames`\)\n\n/);
    expect(t).toMatch(/- `lames\.essenceBois` \(choix\) : Essence de bois = `pin-classe4` ; options : `pin-classe4` \(Pin classe 4 \(autoclave\)\), `douglas` \(Douglas\)/);
    expect(t).toMatch(/- `fondation\.hauteurVis` \(nombre, en cm, au moins 10 cm, pas 5\) : Longueur vis dans le sol = `40`/);
    // Quelques milliers de tokens : le cout estime d'une demande (spec §6) tient.
    expect(t.length).toBeLessThan(12000);
  });

  it('sans selection, ne propose aucun champ', () => {
    const t = texteCatalogue(construireCatalogue(planDeReference({ selection: null }).source()));
    expect(t).toMatch(/Aucun objet n’est sélectionné : aucun champ ne s’écrit\./);
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const journal = { toasts: [] as string[], erreurs: [] as string[], blobs: [] as string[] };
vi.mock('../../../../src/shell/dialogs.js', () => ({
  showToast: (m: string) => { journal.toasts.push(m); },
  showErreur: (t: string) => { journal.erreurs.push(t); },
  showErrBanner: () => undefined
}));
vi.mock('../../../../src/shell/download.js', () => ({ telechargerBlob: (nom: string) => { journal.blobs.push(nom); } }));
// Le moteur de la 3D, sans three : ce que la session lui demande, et rien d'autre.
type Regler = (r: { pose: { capDeg: number }; opacite: number; maison: boolean }) => boolean;
type Capturer = (t: { l: number; h: number }, type: string, avecMaison: boolean) => Promise<Blob | null>;
const moteur = {
  reglerPhotomontage3d: vi.fn<Regler>(() => true),
  quitterPhotomontage3d: vi.fn(),
  capturerPhotomontage3d: vi.fn<Capturer>(() => Promise.resolve(new Blob(['image']))),
};
vi.mock('../../../../src/three/demande3d.js', () => ({ moteur3d: () => moteur, avecMoteur3d: (f: (m: typeof moteur) => void) => { f(moteur); } }));

import { creerRegistre } from '../../../../src/app/commandes.js';
import { creerMagasin } from '../../../../src/app/magasin.js';
import { brancherPhotomontage, gesteDuBouton } from '../../../../src/app/ecouteurs/photomontage.js';
import { photomontage, reglerPhotomontage } from '../../../../src/app/photomontage/etat.js';
import { cibleDuProjet, creerSessionPhotomontage, roleDe, sessionPhotomontage } from '../../../../src/app/photomontage/session.js';
import { vue3d } from '../../../../src/three/etat3d.js';
import { fauxAtelier, droits } from '../ecouteurs/faux.js';
import type { ObjetPlan } from '../../../../src/model/types.js';

// Le photomontage, cote application : ses commandes, ce qu'il vise, ce qu'il garde de la scene, et ce qu'il ne touche pas du projet.

const carre = (x: number, y: number, c: number) => [{ x, y }, { x: x + c, y }, { x: x + c, y: y + c }, { x, y: y + c }];
const objet = (o: Partial<ObjetPlan> & { key: string }): ObjetPlan => ({ type: 'polygon', name: o.key, ...o }) as unknown as ObjetPlan;
const terrasse = objet({ key: 't', fonction: 'terrasse', pts: carre(0, -20, 4) } as never);
const maison = objet({ key: 'm', fonction: 'batiment', pts: carre(0, -12, 8) } as never);
const voisine = objet({ key: 'v', fonction: 'batiment', pts: carre(40, 0, 8), voisinage: true } as never);
const parcelle = objet({ key: 'parcelle', fonction: 'terrain', pts: carre(-10, -30, 40) } as never);
const arbre = objet({ key: 'a', type: 'circle', fonction: 'arbre', center: { x: 5, y: -25 }, r: 2 } as never);
const pergola = objet({ key: 'p', fonction: 'pergola', pts: carre(6, -20, 3) } as never);
const ancienne = objet({ key: 'e', fonction: 'terrasse', pts: carre(20, -20, 3), existant: true } as never);
const OBJETS = [parcelle, maison, voisine, arbre, terrasse, pergola, ancienne];

const pose = { x: 0, y: -30, hauteurM: 1.6, capDeg: 0, inclinaisonDeg: 0, champDeg: 50 };
const calage = { pose, position: 'sansGps' as const, cap: 'versLeProjet' as const, focale35: null, distanceM: null };

function monter(ecrire = true) {
  const a = fauxAtelier({ objects: OBJETS, terrasseSelectedKey: 't' } as never);
  const magasin = creerMagasin(a.etat);
  magasin.definirVue('vue3d');
  const cmd = creerRegistre(droits(ecrire));
  const d = {
    magasin, objets: () => a.etat.objects, terrasseChoisie: () => a.etat.terrasseSelectedKey ?? null,
    ouvrirVue3d: vi.fn(), basculerTousLesObjets: vi.fn((actif: boolean) => { vue3d.tousLesObjets = actif; }), redimensionner3d: vi.fn(),
  };
  brancherPhotomontage(cmd, d);
  // La session est un module charge une fois : chaque test la retrouve, avec les dependances du premier.
  return { a, cmd, d, magasin };
}

/** Laisse passer le chargement a la demande de la session, puis ses promesses. */
const attendre = async () => { for (let i = 0; i < 5; i++) await new Promise((ok) => setTimeout(ok, 0)); };

beforeEach(() => {
  for (const l of Object.values(journal)) l.length = 0;
  Object.values(moteur).forEach((f) => f.mockClear());
  Object.assign(photomontage, { actif: false, lecture: false, photo: null, calage: null, pose: null, opacite: 1, maison: false, maisonDansImage: false, format: 'jpeg' });
  vue3d.tousLesObjets = true;
  vi.stubGlobal('requestAnimationFrame', (f: () => void) => { f(); return 0; });
});

describe('ce que le photomontage garde de la scene', () => {
  it('ne garde que ce que le projet ajoute ; un batiment de la parcelle aide a caler, pas celui d un voisin', () => {
    expect(roleDe(terrasse)).toBe('projet');
    expect(roleDe(pergola)).toBe('projet');
    expect(roleDe(maison)).toBe('bati');
    expect(roleDe(voisine)).toBe('autre');
    expect(roleDe(parcelle)).toBe('autre');
    expect(roleDe(arbre)).toBe('autre');
    // Une terrasse qui existe deja est sur la photo.
    expect(roleDe(ancienne)).toBe('autre');
    expect(roleDe(undefined)).toBe('autre');
  });

  it('vise la terrasse choisie, la maison de la parcelle en fond', () => {
    const c = cibleDuProjet(OBJETS, 't');
    expect(c.centre).toEqual({ x: 2, y: -18 });
    expect(c.rayon).toBeCloseTo(Math.hypot(2, 2), 9);
    expect(c.maison).toEqual({ x: 4, y: -8 });
  });

  it('sans terrasse du projet, vise tout ce que le projet ajoute ; sans rien, la maison', () => {
    const c = cibleDuProjet([parcelle, maison, pergola, ancienne], null);
    expect(c.centre).toEqual({ x: 7.5, y: -18.5 });
    expect(cibleDuProjet([parcelle, maison], null).centre).toEqual({ x: 4, y: -8 });
  });
});

describe('les commandes du photomontage', () => {
  it('lit le geste d un bouton, et refuse ce qu il ne connait pas', () => {
    const b = (geste: string) => { const e = document.createElement('button'); e.dataset.geste = geste; return e; };
    expect(gesteDuBouton(b('tournerDeg:-2'))).toEqual({ tournerDeg: -2 });
    expect(gesteDuBouton(b('champFois:1.05'))).toEqual({ champFois: 1.05 });
    expect(gesteDuBouton(b('exploser:1'))).toBeNull();
    expect(gesteDuBouton(b('monterM:abc'))).toBeNull();
    expect(gesteDuBouton(undefined)).toBeNull();
  });

  it('entre dans le mode sans rien ecrire au projet, meme en lecture seule ; ajuster et enregistrer attendent une photo', async () => {
    const { a, cmd } = monter(false);
    expect(cmd.etat('3d.photomontage').utilisable).toBe(true);
    expect(cmd.etat('3d.photomontageAjuster').utilisable).toBe(false);
    expect(cmd.etat('3d.photomontageRecaler').utilisable).toBe(false);
    cmd.executer('3d.photomontage');
    await attendre();
    expect(photomontage.actif).toBe(true);
    // Sans photo, la scene reste celle de la Vue 3D.
    expect(moteur.reglerPhotomontage3d).not.toHaveBeenCalled();
    expect(a.pushHistory).not.toHaveBeenCalled();
    expect(a.markDirty).not.toHaveBeenCalled();
  });

  it('ajuste le point de vue par le bouton, revient au calage, et n ecrit rien au projet', async () => {
    const { a, cmd } = monter();
    cmd.executer('3d.photomontage');
    await attendre();
    // La photo lue (la lecture du fichier, elle, demande un navigateur : la fumee la joue).
    reglerPhotomontage({ photo: { l: 1600, h: 1200, nom: 'jardin.jpg' }, calage, pose });
    expect(cmd.etat('3d.photomontageAjuster').utilisable).toBe(true);
    const bouton = document.createElement('button');
    bouton.dataset.geste = 'tournerDeg:2';
    cmd.executer('3d.photomontageAjuster', bouton);
    await attendre();
    expect(photomontage.pose?.capDeg).toBe(2);
    expect(photomontage.calage?.pose.capDeg).toBe(0);
    cmd.executer('3d.photomontageRecaler');
    await attendre();
    expect(photomontage.pose).toEqual(pose);
    expect(a.pushHistory).not.toHaveBeenCalled();
    expect(a.markDirty).not.toHaveBeenCalled();
    expect(a.etat.objects).toBe(OBJETS);
  });

  it('enregistre l image a la taille de la photo, sans la maison en transparence sauf choix explicite', async () => {
    const { cmd } = monter();
    cmd.executer('3d.photomontage');
    await attendre();
    reglerPhotomontage({ photo: { l: 1536, h: 2048, nom: 'jardin.jpg' }, calage, pose, maison: true });
    cmd.executer('export.photomontage');
    await attendre();
    expect(moteur.capturerPhotomontage3d).toHaveBeenLastCalledWith({ l: 1536, h: 2048 }, 'image/jpeg', false);
    expect(journal.blobs).toEqual(['photomontage_t.jpg']);
    reglerPhotomontage({ maisonDansImage: true, format: 'png' });
    cmd.executer('export.photomontage');
    await attendre();
    expect(moteur.capturerPhotomontage3d).toHaveBeenLastCalledWith({ l: 1536, h: 2048 }, 'image/png', true);
    expect(journal.blobs[1]).toBe('photomontage_t.png');
    expect(journal.toasts.at(-1)).toMatch(/1536 × 2048 px/);
  });

  it('dit en clair une image que le navigateur ne rend pas', async () => {
    const { cmd } = monter();
    cmd.executer('3d.photomontage');
    await attendre();
    reglerPhotomontage({ photo: { l: 800, h: 600, nom: 'p.jpg' }, calage, pose });
    moteur.capturerPhotomontage3d.mockResolvedValueOnce(null);
    cmd.executer('export.photomontage');
    await attendre();
    expect(journal.blobs).toEqual([]);
    expect(journal.erreurs[0]).toMatch(/L’image du photomontage/);
  });

  it('hors du mode, l entree du menu Exporter y mene au lieu d enregistrer', async () => {
    const { cmd } = monter();
    cmd.executer('export.photomontage');
    await attendre();
    expect(photomontage.actif).toBe(true);
    expect(moteur.capturerPhotomontage3d).not.toHaveBeenCalled();
  });

  it('coche « Tous les objets » le temps du mode, et rend la Vue 3D comme avant en sortant', async () => {
    const { cmd } = monter();
    const s = sessionPhotomontage();
    vue3d.tousLesObjets = false;
    cmd.executer('3d.photomontage');
    await attendre();
    expect(vue3d.tousLesObjets).toBe(true);
    cmd.executer('3d.photomontage');
    await attendre();
    expect(photomontage.actif).toBe(false);
    expect(moteur.quitterPhotomontage3d).toHaveBeenCalledOnce();
    expect(vue3d.tousLesObjets).toBe(false);
    expect(s).not.toBeNull();
  });

  it('quitter la Vue 3D quitte le mode ; les reglages d affichage suivent', () => {
    const a = fauxAtelier({ objects: OBJETS, terrasseSelectedKey: 't' } as never);
    const magasin = creerMagasin(a.etat);
    magasin.definirVue('vue3d');
    const s = creerSessionPhotomontage({ magasin, objets: () => a.etat.objects, terrasseChoisie: () => 't', ouvrirVue3d: vi.fn(), basculerTousLesObjets: vi.fn(), redimensionner3d: vi.fn() });
    s.entrer();
    s.reglerAffichage({ opacite: 0.5, maison: true });
    expect(photomontage).toMatchObject({ actif: true, opacite: 0.5, maison: true });
    magasin.definirVue('plan');
    expect(photomontage.actif).toBe(false);
    expect(moteur.quitterPhotomontage3d).toHaveBeenCalledOnce();
    // Les reglages restent ceux de la session : on y revient ou on l'avait laisse.
    expect(photomontage.opacite).toBe(0.5);
  });
});

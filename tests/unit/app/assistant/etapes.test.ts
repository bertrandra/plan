import { describe, it, expect, vi } from 'vitest';
import { planDeReference } from '../../../fixtures/assistant/plan.js';
import { construireCatalogue } from '../../../../src/app/assistant/catalogue.js';
import { lireReponse, resoudre, resoudreEtape } from '../../../../src/app/assistant/etapes.js';
import { appliquerEtapes } from '../../../../src/app/assistant/appliquer.js';
import { creerServiceAssistant } from '../../../../src/app/assistant/service.js';
import { creerRegistre, PHRASE_PERMISSION, type Droits } from '../../../../src/app/commandes.js';
import { brancherObjets } from '../../../../src/app/ecouteurs/objets.js';
import type { ClientAnalyse, DemandeAnalyse } from '../../../../src/io/analyseClaude.js';
import type { Atelier } from '../../../../src/app/atelier.js';

// La liste de l'assistant (lot L6) : la reponse de Claude relue dans le contrat (§4.7), chaque etape confrontee au catalogue (grisee
// avec sa raison), « Appliquer » tout ou rien, et le service qui envoie la demande avec son catalogue.

const commande = (id: string, pourquoi = 'Comme demandé.') => ({ genre: 'commande', commande: id, objet: '', champ: '', valeur: '', pourquoi });
const champ = (objet: string, cle: string, valeur: string) => ({ genre: 'champ', commande: '', objet, champ: cle, valeur, pourquoi: 'Comme demandé.' });

describe('la reponse, dans la forme du contrat', () => {
  it('rend les etapes et les questions, et ecarte ce qui ne s y lit pas', () => {
    const r = lireReponse({ etapes: [commande('affichage.grille'), champ('terrasse', 'lames.essenceBois', ' douglas '), { genre: 'autre' }, null, commande('')], questions: ['Laquelle ?', '', 3] });
    expect(r).toEqual({
      etapes: [{ commande: 'affichage.grille', pourquoi: 'Comme demandé.' }, { champ: { objet: 'terrasse', cle: 'lames.essenceBois', valeur: 'douglas' }, pourquoi: 'Comme demandé.' }],
      questions: ['Laquelle ?']
    });
    expect(lireReponse(null)).toEqual({ etapes: [], questions: [] });
  });
});

describe('une etape confrontee au catalogue', () => {
  const p = planDeReference({ selection: 'terrasse' });
  const cat = construireCatalogue(p.source());
  const resoudre1 = (e: object) => resoudreEtape(lireReponse({ etapes: [e] }).etapes[0]!, cat);

  it('dit une commande et une bascule en clair, utilisables', () => {
    expect(resoudre1(commande('affichage.grille'))).toMatchObject({ libelle: 'Grille : afficher', afficher: true, ecrit: 'affichage', refus: null });
    expect(resoudre1(commande('objet.dupliquer'))).toMatchObject({ libelle: 'Dupliquer', ecrit: 'projet', refus: null });
  });

  it('grise une commande que le registre refuse, avec sa raison', () => {
    expect(resoudre1(commande('objet.terrassePiscine')).refus).toBe('Indisponible dans l’état actuel du plan.');
    // Une permission manquante (plateforme branchee) : la phrase du registre.
    const droits: Droits = { branchee: () => true, aCapacite: () => true, aPermission: () => false, reste: () => null };
    const r = creerRegistre(droits);
    brancherObjets(new Proxy({ etat: p.etat }, { get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : () => {}) }) as unknown as Atelier, r);
    const c2 = construireCatalogue({ ...p.source(), commandes: r.lister(), etat: (id) => r.etat(id) });
    expect(resoudreEtape({ commande: 'objet.dupliquer', pourquoi: '' }, c2).refus).toBe(PHRASE_PERMISSION);
  });

  it('ecarte une commande hors du catalogue, et un champ inconnu', () => {
    expect(resoudre1(commande('objet.supprimer')).refus).toMatch(/ne propose pas cette commande/);
    expect(resoudre1(champ('terrasse', 'lames.inconnu', 'x')).refus).toMatch(/ne connaît pas ce champ/);
  });

  it('dit un champ, son option et son unite ; refuse une valeur hors des bornes, hors des options, ou mal formee', () => {
    expect(resoudre1(champ('terrasse', 'lames.essenceBois', 'douglas'))).toMatchObject({ libelle: '3. Lames et sens de pose › Essence de bois : Douglas', refus: null, champ: { valeur: 'douglas' } });
    expect(resoudre1(champ('terrasse', 'structure.soliveEntraxe', '50'))).toMatchObject({ libelle: '4. Structure porteuse › Entraxe solives : 50 cm', refus: null, champ: { valeur: 50 } });
    expect(resoudre1(champ('terrasse', 'structure.soliveEntraxe', '5')).refus).toMatch(/sort des bornes du champ \(de 20 cm\)/);
    expect(resoudre1(champ('terrasse', 'lames.essenceBois', 'ipe')).refus).toMatch(/n’est pas une option/);
    expect(resoudre1(champ('terrasse', 'structure.avecLambourde', 'peut-être')).refus).toMatch(/ni oui ni non/);
    expect(resoudre1(champ('terrasse', 'structure.avecLambourde', 'non'))).toMatchObject({ refus: null, champ: { valeur: false } });
    expect(resoudre1(champ('terrasse', 'apparence.fill', 'bleu')).refus).toMatch(/n’est pas une couleur/);
    // Un champ grise a l'ecran (la portee des vis, calculee tant que le mode automatique est coche) ne s'ecrit pas.
    expect(resoudre1(champ('terrasse', 'appuis.visEntraxe', '150')).refus).toMatch(/grisé/);
  });

  it('refuse un champ d un objet qui n est pas selectionne, en disant lequel selectionner', () => {
    expect(resoudre1(champ('spa', 'objet.name', 'Jacuzzi')).refus).toBe('Ce champ est celui d’un objet qui n’est pas sélectionné : sélectionnez « Spa », puis redemandez.');
  });
});

describe('« Appliquer »', () => {
  it('fait la liste en une etape d annulation, et l annule toute quand une etape est refusee en route', () => {
    const p = planDeReference({ selection: 'terrasse' });
    const avant = p.projet();
    const etapes = resoudre(lireReponse({ etapes: [commande('affichage.grille'), champ('terrasse', 'lames.essenceBois', 'douglas'), commande('objet.dupliquer')] }), construireCatalogue(p.source()));
    // Le registre refuse la duplication au moment de la faire : la liste entiere est defaite, la grille comprise.
    const executer = p.application.executer;
    const r = appliquerEtapes(etapes, { ...p.application, executer: (id) => (id === 'objet.dupliquer' ? false : executer(id)) });
    expect(r).toEqual({ ok: false, raison: '« Dupliquer » a été refusée par Plan. Rien n’a été appliqué.' });
    expect(p.projet()).toBe(avant);
    expect(p.etat.grilleVisible).toBe(false);
    expect(p.historique.pile.vide).toBe(true);
    // Sans refus : une etape d'annulation, et Ctrl+Z rend le projet d'avant (la grille, preference d'affichage, reste).
    expect(appliquerEtapes(etapes, p.application)).toEqual({ ok: true, faites: 3, ignorees: 0 });
    expect(p.etat.objects.filter((o) => o.name?.startsWith('Terrasse')).length).toBe(2);
    expect(p.historique.pile.taille).toBe(1);
    p.historique.annuler();
    expect(p.projet()).toBe(avant);
    expect(p.etat.grilleVisible).toBe(true);
  });

  it('laisse les etapes grisees, et ne fait rien quand aucune ne s applique', () => {
    const p = planDeReference({ selection: 'terrasse' });
    const etapes = resoudre(lireReponse({ etapes: [commande('objet.terrassePiscine'), champ('spa', 'objet.name', 'X')] }), construireCatalogue(p.source()));
    expect(appliquerEtapes(etapes, p.application)).toEqual({ ok: false, raison: 'Aucune étape de la liste ne s’applique.' });
    const deux = resoudre(lireReponse({ etapes: [commande('objet.terrassePiscine'), champ('terrasse', 'objet.name', 'Deck')] }), construireCatalogue(p.source()));
    expect(appliquerEtapes(deux, p.application)).toEqual({ ok: true, faites: 1, ignorees: 1 });
    expect(p.etat.objects.find((o) => o.key === 'terrasse')?.name).toBe('Deck');
  });
});

describe('le service de l assistant', () => {
  const sortie = { etapes: [commande('affichage.grille')], questions: [] };
  const client = (rendu: () => Promise<unknown>) => {
    const demandes: DemandeAnalyse[] = [];
    const c = { immediat: vi.fn(async (d: DemandeAnalyse) => { demandes.push(d); return rendu(); }) } as unknown as ClientAnalyse;
    return { c, demandes };
  };

  it('envoie la demande avec le catalogue genere, usage `assistant`, et montre la liste', async () => {
    const p = planDeReference({ selection: 'terrasse' });
    const { c, demandes } = client(async () => ({ modele: 'claude-haiku-5-5', prompt: 1, schema: 1, resultats: [{ id: 'assistant', statut: 'reussi', passe: 1, sortie, erreur: null, cout: 0.0011 }] }));
    const s = creerServiceAssistant({ client: () => c, identite: () => ({ projet: 'p1', idu: null, adresse: null }), source: () => p.source(), application: p.application });
    expect(s.envoiPossible()).toEqual({ ok: false, raison: null });
    s.saisir('Affichez la grille.');
    expect(s.envoiPossible()).toEqual({ ok: true });
    await s.envoyer();
    expect(demandes[0]).toMatchObject({ projet: 'p1', audit: 'assistant', usage: 'assistant', requetes: [{ id: 'assistant', passe: 1, facades: 0 }] });
    const blocs = demandes[0]!.requetes[0]!.contenu as { type: string; text: string }[];
    expect(blocs.map((b) => b.type)).toEqual(['text', 'text']);
    expect(blocs[0]!.text).toMatch(/^# Catalogue de Plan/);
    expect(blocs[1]!.text).toBe('Demande :\nAffichez la grille.\nFin de la demande.');
    expect(s.etat()).toMatchObject({ statut: 'liste', cout: 0.0011, erreur: null });
    expect(s.etapes().map((e) => [e.libelle, e.refus])).toEqual([['Grille : afficher', null]]);
    // La personne affiche la grille elle-meme avant d'appliquer : l'etape est faite, la refaire la masquerait.
    p.application.executer('affichage.grille');
    expect(s.etapes()[0]?.refus).toBe('Déjà fait : affichée.');
  });

  it('dit pourquoi il ne peut pas envoyer, et ce qui a echoue', async () => {
    const p = planDeReference({ selection: 'terrasse' });
    const sans = creerServiceAssistant({ client: () => null, identite: () => ({ projet: null, idu: null, adresse: null }), source: () => p.source(), application: p.application });
    sans.saisir('Affichez la grille.');
    expect(sans.envoiPossible()).toEqual({ ok: false, raison: 'L’assistant passe par le serveur de Plan : connectez-vous à votre organisation.' });
    const { c } = client(async () => { throw new Error('demande d’aide à Claude : Le droit d’écrire les projets est requis pour lancer une analyse.'); });
    const s = creerServiceAssistant({ client: () => c, identite: () => ({ projet: null, idu: null, adresse: null }), source: () => p.source(), application: p.application });
    s.saisir('Affichez la grille.');
    await s.envoyer();
    expect(s.etat()).toMatchObject({ statut: 'erreur', erreur: 'demande d’aide à Claude : Le droit d’écrire les projets est requis pour lancer une analyse.' });
    const { c: illisible } = client(async () => ({ modele: 'm', prompt: 1, schema: 1, resultats: [{ id: 'assistant', statut: 'reussi', passe: 1, sortie: null, erreur: { type: 'sortie_illisible', message: 'Sortie non JSON.' } }] }));
    const s2 = creerServiceAssistant({ client: () => illisible, identite: () => ({ projet: null, idu: null, adresse: null }), source: () => p.source(), application: p.application });
    s2.saisir('x');
    await s2.envoyer();
    expect(s2.etat().erreur).toBe('Claude n’a pas rendu de liste utilisable (Sortie non JSON.). Reformulez, ou réessayez plus tard.');
  });
});

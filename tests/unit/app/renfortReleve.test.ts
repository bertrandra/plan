import { describe, it, expect } from 'vitest';
import { creerAideReleve, contenuRenfort, requetesRenfort, type DemandeAide, type FabriqueImagesRenfort } from '../../../src/app/renfortReleve.js';
import { EchecAnalyse, type ClientAnalyse, type DemandeAnalyse } from '../../../src/io/analyseClaude.js';
import type { AccordAnalyse } from '../../../src/model/auditParcelle.js';
import type { ReponseRenfort } from '../../../src/facade/renfort.js';

// « Demander de l'aide » au releve (lot L18) : l'accord par projet, les deux images et le texte, trois
// passes par la route immediate, le vote ; une panne dite en clair.

const SORTIE: ReponseRenfort = {
  mur: { indices: [], vu: 'attendu' },
  coins: { indices: [], hautGauche: { colonne: 1, ligne: 1 }, hautDroit: 'indetermine', basDroit: 'indetermine', basGauche: 'indetermine' },
  ouvertures: [], manquees: [], confiance: 'forte',
};

function monter(client: ClientAnalyse | null) {
  let accord: AccordAnalyse | null = null;
  const images: FabriqueImagesRenfort = { photo: () => ({ base64: 'UEhPVE8=', mediaType: 'image/jpeg' }), elevation: () => ({ base64: 'RUxFVg==', mediaType: 'image/png' }) };
  const aide = creerAideReleve({
    client: () => client, identite: () => ({ projet: 'p-1', idu: 'AE0101', adresse: null }),
    memoire: { lire: () => accord, ecrire: (a) => { accord = a; } }, images, maintenant: () => new Date('2026-10-14T08:30:00Z'),
  });
  return { aide, accord: () => accord };
}

const DEMANDE: DemandeAide = {
  photo: { largeur: 4, hauteur: 3, donnees: new Uint8ClampedArray(48) }, coins: [], coinsTrouves: false, elevation: null,
  largeurM: 9, hauteurM: 5.6, hauteurMesuree: false, ouvertures: [], grille: null, signaux: ['coins'], etiquette: 'sud',
};

describe('l aide de Claude au releve', () => {
  it('garde l accord pour le projet, partage coche par defaut', () => {
    const t = monter(null);
    expect(t.aide.disponible()).toBe(false);
    expect(t.aide.accordDonne()).toBe(false);
    t.aide.accorder();
    expect(t.accord()).toEqual({ t: '2026-10-14T08:30:00.000Z', partage: true });
    expect(t.aide.accordDonne()).toBe(true);
  });

  it('envoie trois passes identiques par la route immediate, et vote', async () => {
    const recues: DemandeAnalyse[] = [];
    const client = {
      immediat: async (d: DemandeAnalyse) => { recues.push(d); return { modele: 'claude-haiku-5-5', prompt: 1, schema: 1, resultats: d.requetes.map((q, i) => ({ id: q.id, statut: i === 2 ? ('echoue' as const) : ('reussi' as const), passe: q.passe, sortie: SORTIE, erreur: null })) }; },
    } as unknown as ClientAnalyse;
    const t = monter(client);
    const r = await t.aide.demander(DEMANDE);
    expect('vote' in r && r.vote.passes).toBe(2);
    expect('vote' in r && r.vote.coins[0]?.repere).toEqual({ colonne: 1, ligne: 1 });
    const d = recues[0]!;
    expect(d).toMatchObject({ projet: 'p-1', idu: 'AE0101', usage: 'renfort', audit: 'releve-20261014083000' });
    expect(d.requetes.map((q) => [q.id, q.passe, q.usage, q.facades])).toEqual([['aide-p1', 1, 'renfort', 1], ['aide-p2', 2, 'renfort', 0], ['aide-p3', 3, 'renfort', 0]]);
    expect(d.requetes[2]!.contenu).toEqual(d.requetes[0]!.contenu);
    // A l'etape des coins, pas d'elevation : Claude ne situe que les coins.
    const textes = d.requetes[0]!.contenu.filter((b): b is { type: 'text'; text: string } => b.type === 'text').map((b) => b.text);
    expect(textes[1]).toMatch(/^Pas d’image 2/);
    expect(textes[2]).toMatch(/coins non trouvés sur la photo/);
  });

  it('dit pourquoi rien n est revenu', async () => {
    const plafond = { immediat: async () => { throw new EchecAnalyse('plafond', 'x'); } } as unknown as ClientAnalyse;
    expect(await monter(plafond).aide.demander(DEMANDE)).toEqual({ erreur: 'Le plafond de l’analyse est atteint pour aujourd’hui ou ce mois-ci.' });
    const vide = { immediat: async () => ({ modele: 'm', prompt: 1, schema: 1, resultats: [{ id: 'aide-p1', statut: 'echoue', passe: 1, sortie: null, erreur: { type: 'refusal', message: 'Analyse refusée par le modèle.' } }] }) } as unknown as ClientAnalyse;
    expect(await monter(vide).aide.demander(DEMANDE)).toEqual({ erreur: 'Claude n’a rendu aucune réponse lisible (Analyse refusée par le modèle.).' });
    expect(await monter(null).aide.demander(DEMANDE)).toEqual({ erreur: 'L’aide de Claude n’est pas ouverte à ce compte.' });
  });

  it('met la photo, puis l elevation, puis le texte', () => {
    const c = contenuRenfort({ base64: 'QQ==', mediaType: 'image/jpeg' }, { base64: 'Qg==', mediaType: 'image/png' }, 'Largeur du mur : 9,00 m.');
    expect(c.map((b) => b.type)).toEqual(['image', 'text', 'image', 'text', 'text']);
    expect(requetesRenfort('b1-f2', c, 0).map((q) => q.id)).toEqual(['b1-f2-p1', 'b1-f2-p2', 'b1-f2-p3']);
  });
});

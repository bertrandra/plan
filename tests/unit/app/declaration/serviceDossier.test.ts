import { describe, it, expect, vi } from 'vitest';
import { creerServiceDossier, type ContexteDossier } from '../../../../src/app/declaration/serviceDossier.js';
import { lireSortieTexte, redigerTexte, texteDemandeRedaction } from '../../../../src/app/declaration/redactionTexte.js';
import { brancherDossier } from '../../../../src/app/declaration/commandesDossier.js';
import { creerRegistre } from '../../../../src/app/commandes.js';
import { empreinteFaits, faitsDuDossier, texteDesFaits } from '../../../../src/export/faitsDossier.js';
import { sha256Texte } from '../../../../src/util/sha256.js';
import type { ClientAnalyse, DemandeAnalyse } from '../../../../src/io/analyseClaude.js';
import type { ObjetPlan } from '../../../../src/model/types.js';

// Le dossier de declaration vu du dialogue (lot L5) : rediger range un brouillon (un pas d'annulation), valider retient le texte tel
// qu'il est ecrit, retirer l'enleve ; le brouillon perime se dit ; rien n'ecrit en lecture seule ; les photos se prennent dans l'audit.

const rect = (x: number, y: number, L: number, l: number) => [{ x, y }, { x: x + L, y }, { x: x + L, y: y + l }, { x, y: y + l }];
const objets = (): ObjetPlan[] => [
  { key: 'parcelle', name: 'Parcelle', type: 'polygon', fonction: 'terrain', pts: rect(0, 0, 30, 20), cadastre: { idu: '78650000AB0123', section: 'AB', numero: '0123', adresse: '1 rue A 78110 Le Vésinet' } },
  { key: 'p', name: 'Pergola 1', type: 'polygon', fonction: 'pergola', pts: rect(2, 2, 4, 3), pergola: { debord: 0.2 } },
] as ObjetPlan[];

/** Un client de Claude SYNTHETIQUE : il rend le texte donne, et garde la demande. */
function client(sortie: unknown, demandes: DemandeAnalyse[] = []): ClientAnalyse {
  return {
    immediat: async (d: DemandeAnalyse) => { demandes.push(d); return { modele: 'claude-haiku-5-5', prompt: 1, schema: 1, trace: '20261030-100000-abc', resultats: [{ id: d.requetes[0]!.id, statut: 'reussi', passe: 1, sortie, erreur: null, cout: 0.0021 }] }; },
  } as unknown as ClientAnalyse;
}

function contexte(etat: { objects: ObjetPlan[]; lectureSeule?: boolean }, c: ClientAnalyse | null = client({ texte: 'Brouillon de Claude.', reserves: ['la couleur'] })): ContexteDossier & { toasts: string[]; pile: number } {
  const ctx = {
    etat, toasts: [] as string[], pile: 0,
    pushHistory: () => { ctx.pile++; }, markDirty: () => {}, notifier: () => {}, toast: (m: string) => { ctx.toasts.push(m); },
    maintenant: () => new Date('2026-10-30T10:00:00Z'),
    redaction: { client: () => c, identite: () => ({ projet: 'p1', idu: null, adresse: null }), maintenant: () => new Date('2026-10-30T10:00:00Z') },
    ramenerEnJpeg: async (image: string) => ({ image, largeur: 4, hauteur: 3 }),
    photosDeLAudit: async () => [{ image: 'data:image/jpeg;base64,QUJD', legende: 'Clôture, photo 1' }],
    relire: async () => [],
  };
  return ctx;
}

describe('la redaction d un texte', () => {
  it('envoie la piece et les faits du projet, et rend un brouillon qui garde leur empreinte', async () => {
    const demandes: DemandeAnalyse[] = [];
    const o = objets();
    const r = await redigerTexte(o, 'notice', { client: () => client({ texte: '  Le projet…  ', reserves: ['la couleur', 3] }, demandes), identite: () => ({ projet: null, idu: null, adresse: null }), maintenant: () => new Date('2026-10-30T10:00:00Z') });
    if (!('brouillon' in r)) throw new Error(r.erreur);
    const faits = texteDesFaits(faitsDuDossier(o));
    expect(demandes[0]).toMatchObject({ usage: 'texte', requetes: [{ id: 'texte-notice', passe: 1, facades: 0, contenu: [{ type: 'text', text: texteDemandeRedaction('notice', faits) }] }] });
    expect(r.brouillon).toMatchObject({ texte: 'Le projet…', reserves: ['la couleur'], modele: 'claude-haiku-5-5', prompt: 1, schema: 1, cout: 0.0021, trace: '20261030-100000-abc', entrees: sha256Texte(faits) });
    expect(r.brouillon.entrees).toBe(empreinteFaits(o));
  });

  it('dit pourquoi elle ne peut pas : sans client, sans texte rendu', async () => {
    const ctx = { identite: () => ({ projet: null, idu: null, adresse: null }), maintenant: () => new Date() };
    expect(await redigerTexte(objets(), 'notice', { ...ctx, client: () => null })).toEqual({ erreur: expect.stringMatching(/connectez-vous/) });
    expect(await redigerTexte(objets(), 'notice', { ...ctx, client: () => client({ texte: '' }) })).toEqual({ erreur: expect.stringMatching(/pas rendu de texte utilisable/) });
    expect(lireSortieTexte({ texte: 'x', reserves: 'non' }, 'notice')).toEqual({ texte: 'x', reserves: [] });
  });
});

describe('le service du dossier', () => {
  it('range le brouillon, le valide tel qu il est ecrit, dit qu il est perime, et le retire, chaque fois en un pas', async () => {
    const etat = { objects: objets() };
    const ctx = contexte(etat);
    const s = creerServiceDossier(ctx);
    expect(s.etatTexte('description').edition).toMatch(/^Construction de une pergola/);
    await s.rediger('notice');
    expect(ctx.pile).toBe(1);
    expect(s.etatTexte('notice')).toMatchObject({ edition: 'Brouillon de Claude.', perime: false });
    s.editer('notice', 'Brouillon corrigé.');
    expect(ctx.pile).toBe(1);
    s.valider('notice');
    expect(ctx.pile).toBe(2);
    expect(etat.objects[0]!.dossier?.textes[0]).toMatchObject({ piece: 'notice', valide: { texte: 'Brouillon corrigé.', le: '2026-10-30', entrees: empreinteFaits(etat.objects) } });
    // Le projet change : le brouillon est perime, le texte valide date ; il ne se reecrit pas.
    (etat.objects[1] as { pts: { x: number; y: number }[] }).pts = rect(2, 2, 5, 3);
    expect(s.etatTexte('notice')).toMatchObject({ perime: true, valideDate: true, edition: 'Brouillon corrigé.' });
    s.retirer('notice');
    expect(etat.objects[0]).not.toHaveProperty('dossier');
    expect(ctx.pile).toBe(3);
  });

  it('refuse un texte vide ou trop long, et n ecrit rien en lecture seule', async () => {
    const etat = { objects: objets(), lectureSeule: false };
    const ctx = contexte(etat);
    const s = creerServiceDossier(ctx);
    s.editer('notice', '   ');
    s.valider('notice');
    s.editer('description', 'x'.repeat(1001));
    s.valider('description');
    expect(ctx.toasts.map((t) => t.slice(0, 20))).toEqual(['Le texte est vide : ', 'Le texte fait 1001 c']);
    expect(etat.objects[0]).not.toHaveProperty('dossier');
    etat.lectureSeule = true;
    await s.rediger('notice');
    s.editer('notice', 'Texte.');
    s.valider('notice');
    expect(ctx.pile).toBe(0);
    expect(etat.objects[0]).not.toHaveProperty('dossier');
  });

  it('prend une photographie parmi celles de l audit, et la retire', async () => {
    const etat = { objects: objets() };
    const ctx = contexte(etat);
    const s = creerServiceDossier(ctx);
    await s.choisirPhoto('DP8');
    expect(etat.objects[0]).not.toHaveProperty('dossier');
    await s.choisirPhoto('DP8:audit:0');
    expect(s.photo('DP8')).toMatchObject({ piece: 'DP8', image: 'data:image/jpeg;base64,QUJD', source: 'audit', largeur: 4, hauteur: 3 });
    await s.choisirPhoto('DP8:audit:5');
    s.retirerPhoto('DP8');
    expect(etat.objects[0]).not.toHaveProperty('dossier');
  });

  it('declare ses commandes, grisees avec leur raison sans parcelle ou sans serveur', async () => {
    const etat = { objects: objets() };
    const cmd = creerRegistre();
    const s = creerServiceDossier(contexte(etat, null));
    brancherDossier(cmd, s);
    expect(cmd.etat('export.redigerTexte')).toEqual({ utilisable: false, raison: 'contexte', message: expect.stringMatching(/connectez-vous/) });
    expect(cmd.etat('export.validerTexte')).toEqual({ utilisable: true });
    const rien = creerRegistre();
    brancherDossier(rien, creerServiceDossier(contexte({ objects: [] })));
    expect(rien.etat('export.validerTexte')).toEqual({ utilisable: false, raison: 'contexte', message: expect.stringMatching(/Créez d’abord le plan/) });
    const valider = vi.spyOn(s, 'valider');
    expect(cmd.executer('export.validerTexte', undefined, { valeur: 'notice' })).toBe(true);
    expect(valider).toHaveBeenCalledWith('notice');
  });
});

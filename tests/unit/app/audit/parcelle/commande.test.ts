import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { brancherAuditParcelle, parcelleCadastrale, RAISON_SANS_PARCELLE } from '../../../../../src/app/audit/parcelle/commande.js';
import { creerRegistre, PHRASE_PERMISSION, type Droits } from '../../../../../src/app/commandes.js';
import { parcours } from '../../../../../src/app/parcours.js';
import { creerEtat } from '../../../../../src/core/state.js';
import { entrerEnAdmin } from '../../../../../src/app/acces.js';
import type { ClientAudits, FicheAudit } from '../../../../../src/io/auditsServeur.js';
import type { ObjetPlan } from '../../../../../src/model/types.js';

// La commande « Auditer la parcelle… » (MD/spec-audit.md §11) : grisee avec sa raison en lecture
// seule ou sans parcelle cadastrale ; elle ouvre la liste de controle, et la meme session a chaque fois.

const parcelle = (cadastre: Record<string, unknown> | null): ObjetPlan => ({ key: 'parcelle', name: 'Parcelle', type: 'polygon', fonction: 'terrain', pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], cadastre } as ObjetPlan);
const droits = (ecrire: boolean): Droits => ({ branchee: () => true, aCapacite: () => true, aPermission: (c) => c !== 'projects.write' || ecrire, reste: () => null });

function monter(objets: ObjetPlan[], d?: Droits) {
  const etat = creerEtat({ objects: objets } as never, (o) => o as never);
  const cmd = creerRegistre(d);
  const ouvrir3d = vi.fn();
  const b = brancherAuditParcelle({ etat, ouvrir3d, signaler: () => {}, stockage: null, suivre: () => () => {}, boussole: { suivre: () => () => {}, autoriser: async () => false }, surligner: () => {}, retirerPosition: () => {} }, cmd);
  return { cmd, b, etat };
}

afterEach(() => parcours.fermer());

// Les commandes chargent la session au premier usage (moteur.ts, AD-10). Sous Vitest, ce premier chargement transforme des dizaines
// de modules et passe la seconde d'un `waitFor` : on le fait une fois ici, l'import des commandes retrouve le meme module.
beforeAll(async () => { await import('../../../../../src/app/audit/parcelle/moteur.js'); }, 60000);

describe('la commande audit.parcelle', () => {
  it('reconnait une parcelle cadastrale par son calage, et la nomme par son IDU', () => {
    expect(parcelleCadastrale([parcelle({ idu: '78650000AE0101', origineLat: 48.9, origineLon: 2.13 })])).toBe('78650000AE0101');
    expect(parcelleCadastrale([parcelle({ origineLat: 48.9, origineLon: 2.13 })])).toBe('48.900000,2.130000');
    expect(parcelleCadastrale([parcelle(null)])).toBeNull();
    expect(parcelleCadastrale([])).toBeNull();
  });

  it('est grisee avec sa raison sans parcelle cadastrale', () => {
    const { cmd } = monter([parcelle(null)]);
    expect(cmd.etat('audit.parcelle')).toEqual({ utilisable: false, raison: 'contexte', message: RAISON_SANS_PARCELLE });
    expect(cmd.executer('audit.parcelle')).toBe(false);
    expect(cmd.obtenir('audit.parcelle')).toMatchObject({ libelle: 'Auditer la parcelle…', groupe: 'audit', permission: 'projects.write' });
  });

  it('est grisee avec sa raison en lecture seule', () => {
    const { cmd } = monter([parcelle({ idu: 'X', origineLat: 48.9, origineLon: 2.13 })], droits(false));
    expect(cmd.etat('audit.parcelle')).toEqual({ utilisable: false, raison: 'permission', message: PHRASE_PERMISSION });
  });

  it('ouvre la liste de controle, la meme session a chaque fois', async () => {
    const { cmd, b } = monter([parcelle({ idu: 'X', origineLat: 48.9, origineLon: 2.13 })], droits(true));
    expect(cmd.executer('audit.parcelle')).toBe(true);
    await vi.waitFor(() => expect(parcours.courant()?.type).toBe('auditParcelle'));
    const premiere = b.session();
    parcours.fermer();
    cmd.executer('audit.parcelle');
    await vi.waitFor(() => expect(parcours.courant()?.type).toBe('auditParcelle'));
    expect(b.session()).toBe(premiere);
  });
});

describe('la commande audit.importerParcelle', () => {
  /** Un fichier d'audit minimal de cette parcelle : une capture vide, rien a proposer. */
  const fichier = (idu: string) => JSON.stringify({
    format: 'plan-audit-parcelle', version: 1, parcelle: { idu, adresse: null, origine: null }, code: { version: '2.2.0', commit: null },
    regles: { lectureToits: 1, lectureMurs: 2 }, debut: '2026-10-13T08:00:00.000Z', finCapture: '2026-10-13T08:30:00.000Z', ecritLe: '2026-10-13T09:00:00.000Z',
    batiments: [], cloture: { photos: [] }, portail: { photos: [] }, propositions: [], decisions: [],
  });

  function monterImport(objets: ObjetPlan[], texte: string) {
    const etat = creerEtat({ objects: objets } as never, (o) => o as never);
    const cmd = creerRegistre(droits(true));
    const messages: string[] = [];
    brancherAuditParcelle({
      etat, ouvrir3d: vi.fn(), signaler: (m) => messages.push(m), stockage: null, suivre: () => () => {}, boussole: { suivre: () => () => {}, autoriser: async () => false },
      surligner: () => {}, retirerPosition: () => {}, choisirFichier: (f) => f(texte),
    }, cmd);
    return { cmd, messages };
  }

  it('est grisee avec sa raison sans parcelle cadastrale', () => {
    const { cmd } = monterImport([parcelle(null)], fichier('X'));
    expect(cmd.etat('audit.importerParcelle')).toEqual({ utilisable: false, raison: 'contexte', message: RAISON_SANS_PARCELLE });
    expect(cmd.obtenir('audit.importerParcelle')).toMatchObject({ libelle: 'Importer un audit de parcelle…', groupe: 'audit', permission: 'projects.write' });
  });

  it('refuse le fichier d une autre parcelle, sans rien ouvrir', async () => {
    const { cmd, messages } = monterImport([parcelle({ idu: '78650000AE0101', origineLat: 48.9, origineLon: 2.13 })], fichier('78650000AE0103'));
    cmd.executer('audit.importerParcelle');
    // La lecture du fichier se charge au premier usage (moteur.ts) : le refus arrive apres.
    await vi.waitFor(() => expect(messages).toHaveLength(1));
    expect(messages).toEqual(['Import refusé : Ce fichier est l’audit de la parcelle 78650000AE0103, ce projet est sur la parcelle 78650000AE0101 : ouvrez le projet de cette parcelle.']);
    expect(parcours.courant()).toBeNull();
  });

  it('reprend le fichier de la meme parcelle sur ses propositions', async () => {
    const { cmd, messages } = monterImport([parcelle({ idu: '78650000AE0101', origineLat: 48.9, origineLon: 2.13 })], fichier('78650000AE0101'));
    cmd.executer('audit.importerParcelle');
    await vi.waitFor(() => expect(parcours.courant()?.type).toBe('auditParcelle'));
    const p = parcours.courant();
    expect(p?.type === 'auditParcelle' ? p.session.ecran() : null).toBe('propositions');
    expect(messages.at(-1)).toBe('Audit de la parcelle importé. Vérifiez les cases, puis « Valider ».');
  });
});

describe('la commande audit.envoyerParcelle', () => {
  const client = (): ClientAudits & { envoyer: ReturnType<typeof vi.fn> } => ({
    envoyer: vi.fn(async () => ({ id: 'd1', retrait: 'r1' })), remplacer: vi.fn(async (id: string, retrait: string) => ({ id, retrait })),
    retirer: vi.fn(async () => {}), lister: vi.fn(async () => []), lire: vi.fn(async () => ''),
  });

  it('n agit que dans un audit ouvert, quand quelqu un peut envoyer, et envoie la sauvegarde', async () => {
    const etat = creerEtat({ objects: [parcelle({ idu: '78650000AE0101', origineLat: 48.9, origineLon: 2.13 })] } as never, (o) => o as never);
    const cmd = creerRegistre(droits(true));
    const c = client();
    let peutEnvoyer = false;
    brancherAuditParcelle({
      etat, ouvrir3d: vi.fn(), signaler: () => {}, stockage: null, suivre: () => () => {}, boussole: { suivre: () => () => {}, autoriser: async () => false },
      surligner: () => {}, retirerPosition: () => {}, audits: () => (peutEnvoyer ? c : null), lireGrille: async () => null,
    }, cmd);
    expect(cmd.etat('audit.envoyerParcelle')).toEqual({ utilisable: false, raison: 'contexte' });
    expect(cmd.obtenir('audit.envoyerParcelle')).toMatchObject({ libelle: 'Envoyer l’audit au serveur', groupe: 'audit' });
    cmd.executer('audit.parcelle');
    await vi.waitFor(() => expect(parcours.courant()?.type).toBe('auditParcelle'));
    expect(cmd.etat('audit.envoyerParcelle')).toEqual({ utilisable: false, raison: 'contexte', message: 'Connectez-vous à la plateforme pour envoyer l’audit au serveur de Plan.' });
    peutEnvoyer = true;
    expect(cmd.executer('audit.envoyerParcelle')).toBe(true);
    await vi.waitFor(() => expect(c.envoyer).toHaveBeenCalledOnce());
    expect(c.envoyer.mock.calls[0]?.[1]).toBe('sauvegarde');
  });
});

describe('la commande admin.auditsParcelle', () => {
  const sauvegarde = (idu: string) => JSON.stringify({
    format: 'plan-audit-parcelle', version: 1, parcelle: { idu, adresse: '2 allée des Limites', origine: null }, code: { version: '2.2.0', commit: null },
    regles: { lectureToits: 1, lectureMurs: 2 }, debut: '2026-10-13T08:00:00.000Z', finCapture: null, ecritLe: '2026-10-13T09:00:00.000Z',
    batiments: [], cloture: { photos: [{ type: 'image/jpeg', base64: 'AAAA' }] }, portail: { photos: [] }, propositions: [], decisions: [],
  });
  const fiche = (id: string, idu: string): FicheAudit => ({
    id, recuLe: '2026-10-13T09:00:00Z', organisation: 'org', nature: 'parcelle', idu, commune: null, dossier: null, propositions: null, cas: null, statuts: null,
    adresse: null, taille: 100, marque: 'sauvegarde', photos: 1, phase: 'capture', debut: '2026-10-13T08:00:00.000Z',
  });

  it('est reservee a l admin des demos, et rouvre une sauvegarde en capture, sur le meme depot', async () => {
    const etat = creerEtat({ objects: [parcelle({ idu: '78650000AE0101', origineLat: 48.9, origineLon: 2.13 })] } as never, (o) => o as never);
    const cmd = creerRegistre(droits(true));
    const messages: string[] = [];
    const c: ClientAudits = {
      envoyer: vi.fn(async () => ({ id: 'x', retrait: 'y' })), remplacer: vi.fn(async (id: string, retrait: string) => ({ id, retrait })), retirer: vi.fn(async () => {}),
      lister: vi.fn(async () => [fiche('a', '78650000AE0101'), fiche('b', '78650000AE0199')]), lire: vi.fn(async () => sauvegarde('78650000AE0101')),
    };
    brancherAuditParcelle({
      etat, ouvrir3d: vi.fn(), signaler: (m) => messages.push(m), stockage: null, suivre: () => () => {}, boussole: { suivre: () => () => {}, autoriser: async () => false },
      surligner: () => {}, retirerPosition: () => {}, audits: () => c, admin: () => true, lireGrille: async () => null,
    }, cmd);
    expect(cmd.etat('admin.auditsParcelle')).toEqual({ utilisable: false, raison: 'contexte' });
    entrerEnAdmin();
    expect(cmd.executer('admin.auditsParcelle')).toBe(true);
    await vi.waitFor(() => expect(parcours.courant()?.type).toBe('auditsParcelle'));
    const p = parcours.courant();
    if (p?.type !== 'auditsParcelle') throw new Error('catalogue absent');
    await vi.waitFor(() => expect(p.catalogue.etat().audits).toHaveLength(2));
    const [ici, ailleurs] = p.catalogue.etat().audits ?? [];
    if (!ici || !ailleurs) throw new Error('liste incomplete');
    expect(p.catalogue.raisonOuvrir(ici)).toBeNull();
    expect(p.catalogue.raisonOuvrir(ailleurs)).toBe('Ce projet est sur la parcelle 78650000AE0101 : ouvrez le projet de la parcelle 78650000AE0199.');
    await p.catalogue.ouvrir(ici);
    await vi.waitFor(() => expect(parcours.courant()?.type).toBe('auditParcelle'));
    const q = parcours.courant();
    if (q?.type !== 'auditParcelle') throw new Error('audit absent');
    expect(q.session.ecran()).toBe('liste');
    expect(q.session.capture.lire()).toMatchObject({ phase: 'capture', finCapture: null, sauvegarde: { id: 'a', retrait: '', t: '2026-10-13T09:00:00Z' } });
    expect(messages.at(-1)).toBe('Audit de la parcelle repris en capture : 1 photo. Complétez la liste, puis « Lancer l’analyse ».');
    // L'envoi suivant remplace ce depot, par la session de l'administrateur.
    await q.session.sauvegarde.envoyer();
    expect(c.remplacer).toHaveBeenCalledWith('a', '', expect.any(String), 'sauvegarde');
    expect(c.envoyer).not.toHaveBeenCalled();
  });
  it('montre l avant et l apres d un audit recu sur l ecran des propositions, en lecture seule et a part de l audit en cours', async () => {
    const proposition = { id: 'maison:couverture', cible: { type: 'batiment', cle: 'maison' }, objet: 'Toit de Maison', avant: 'tuile', apres: 'ardoise', source: 'mesure', indices: [], confiance: 0.9, remplaceChoix: null, reserve: null, effet: { type: 'couverture', couverture: 'ardoise' } };
    const termine = JSON.stringify({ ...JSON.parse(sauvegarde('78650000AE0101')), finCapture: '2026-10-13T08:30:00.000Z', propositions: [{ ...proposition, decision: 'validee' }], decisions: [{ t: '2026-10-13T09:00:00.000Z', acceptees: ['maison:couverture'], refusees: [], verifies: [] }] });
    const objets = [parcelle({ idu: '78650000AE0101', origineLat: 48.9, origineLon: 2.13 })];
    const etat = creerEtat({ objects: objets } as never, (o) => o as never);
    const cmd = creerRegistre(droits(true));
    const c: ClientAudits = {
      envoyer: vi.fn(), remplacer: vi.fn(), retirer: vi.fn(), lister: vi.fn(async () => [{ ...fiche('a', '78650000AE0101'), phase: 'analyse' as const, propositions: { total: 1, claude: 0, mesures: 1, validees: 1, refusees: 0, enAttente: 0 } }]),
      lire: vi.fn(async () => termine),
    };
    const b = brancherAuditParcelle({
      etat, ouvrir3d: vi.fn(), signaler: () => {}, stockage: null, suivre: () => () => {}, boussole: { suivre: () => () => {}, autoriser: async () => false },
      surligner: () => {}, retirerPosition: () => {}, audits: () => c, admin: () => true, lireGrille: async () => null,
    }, cmd);
    entrerEnAdmin();
    cmd.executer('admin.auditsParcelle');
    await vi.waitFor(() => expect(parcours.courant()?.type).toBe('auditsParcelle'));
    const p = parcours.courant();
    if (p?.type !== 'auditsParcelle') throw new Error('catalogue absent');
    await vi.waitFor(() => expect(p.catalogue.etat().audits).toHaveLength(1));
    const avant = JSON.stringify(etat.objects);
    await p.catalogue.consulter(p.catalogue.etat().audits?.[0] as FicheAudit);
    await vi.waitFor(() => expect(parcours.courant()?.type).toBe('auditParcelle'));
    const q = parcours.courant();
    if (q?.type !== 'auditParcelle') throw new Error('consultation absente');
    expect(q.session.lectureSeule()).toBe(true);
    expect(q.session.ecran()).toBe('propositions');
    expect(q.session.validation.propositions().map((x) => x.id)).toEqual(['maison:couverture']);
    expect(q.session.validation.decision('maison:couverture')).toBe('validee');
    // L'audit en cours de l'administrateur n'est pas touche, ni le projet.
    expect(b.session()).toBeNull();
    expect(JSON.stringify(etat.objects)).toBe(avant);
    // « Retour aux audits » rouvre le meme catalogue.
    q.retour?.();
    expect(parcours.courant()).toMatchObject({ type: 'auditsParcelle', catalogue: p.catalogue });
  });

  it('refuse la consultation d un fichier d une autre parcelle, sans rien ouvrir', async () => {
    const etat = creerEtat({ objects: [parcelle({ idu: '78650000AE0101', origineLat: 48.9, origineLon: 2.13 })] } as never, (o) => o as never);
    const cmd = creerRegistre(droits(true));
    const messages: string[] = [];
    const c: ClientAudits = {
      envoyer: vi.fn(), remplacer: vi.fn(), retirer: vi.fn(), lister: vi.fn(async () => [fiche('a', '78650000AE0101')]),
      lire: vi.fn(async () => sauvegarde('78650000AE0199')),
    };
    brancherAuditParcelle({
      etat, ouvrir3d: vi.fn(), signaler: (m) => messages.push(m), stockage: null, suivre: () => () => {}, boussole: { suivre: () => () => {}, autoriser: async () => false },
      surligner: () => {}, retirerPosition: () => {}, audits: () => c, admin: () => true,
    }, cmd);
    entrerEnAdmin();
    cmd.executer('admin.auditsParcelle');
    await vi.waitFor(() => expect(parcours.courant()?.type).toBe('auditsParcelle'));
    const p = parcours.courant();
    if (p?.type !== 'auditsParcelle') throw new Error('catalogue absent');
    await vi.waitFor(() => expect(p.catalogue.etat().audits).toHaveLength(1));
    await p.catalogue.consulter(p.catalogue.etat().audits?.[0] as FicheAudit);
    await vi.waitFor(() => expect(messages.at(-1)).toMatch(/^Consultation refusée/));
    expect(messages.at(-1)).toMatch(/^Consultation refusée : Ce fichier est l’audit de la parcelle 78650000AE0199/);
    expect(parcours.courant()?.type).toBe('auditsParcelle');
  });
});

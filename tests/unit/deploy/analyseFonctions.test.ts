import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { constantePhp, php, phpObjets, phpPresent } from '../../fixtures/deploy/appelPhp.js';
import {
  COUT_P1, COUT_P2, SORTIE_ANALYSE, SORTIE_FACADE, SORTIE_VIDE, TEXTE_DESORDONNE, TEXTE_FACADE_SANS_FORMAT, TROUVE_ANALYSE, TROUVE_FACADE, TROUVE_VIDE,
  USAGE_P1, USAGE_P2, demande, reponseParDefaut, reussi, reussiTexte, schemaFacade, texteSqueletteDuSchema
} from '../../fixtures/deploy/fauxAnthropic.js';
import { FIN, RAPIDE, requeteFacade } from '../../fixtures/deploy/scenariosModeles.js';
import { BROUILLON } from '../../fixtures/deploy/scenarioRegles.js';
import { fichierAudit } from '../../fixtures/deploy/contextePlateforme.js';
import { mesureEssai } from '../../fixtures/deploy/scenarioConformite.js';

// Le calcul d'analyse.php, fonction par fonction (deploy/analyse-fonctions.php, appele par
// tests/fixtures/deploy/appel-analyse.php) : le cout et le journal, la demande, la forme de la
// reponse, les comptes, la consommation, les audits. Les routes, elles, sont eprouvees par HTTP
// (analysePhp*.test.ts). Saute si PHP manque ; la CI l'installe.

const racine = path.resolve(__dirname, '../../..');
const deploy = path.join(racine, 'deploy');
type Ligne = Record<string, unknown> & { depuis: string; sortie: number };
const TARIFS = JSON.parse(fs.readFileSync(path.join(deploy, 'claude-tarifs.json'), 'utf8')) as { format: string; lignes: Ligne[] };
const SCHEMA = JSON.parse(fs.readFileSync(path.join(deploy, 'schema-analyse.json'), 'utf8')) as { version: number; schema: Record<string, unknown> };
type Requete = { id: string; passe: number; images: number; facades: number; usage: string; modele: string };
type Demande = { modele: string; essai: boolean; requetes: Requete[] };

/** Une ligne de journal comme analyse.php l'ecrit, avec ce qui varie d'un test a l'autre. */
const ligneJournal = (t: string, plus: Record<string, unknown> = {}) => ({
  t, organisation: 'admin', projet: 'admin', idu: '78650000AE0101', adresse: '2 allée des Limites, Le Vésinet', audit: 'audit-1',
  usage: 'analyse', modele: 'claude-haiku-5-5', batch: true, idBatch: 'msgbatch_1', requete: 'p1', passe: 1,
  tokens: { entree: 4000, ecritureCache: 25000, ecritureCache1h: 0, lectureCache: 0, sortie: 1500 }, images: 1, cout: COUT_P1,
  tarif: '2026-10-13', statut: 'reussi', arret: 'end_turn', prompt: 0, schema: 0, ...plus
});
/** Un filtre de la consommation, tel que lireFiltres le rend. */
const filtre = (plus: Record<string, string> = {}) => ({ du: '2026-10-01', au: '2026-10-14', organisation: null, modele: null, usage: null, parcelle: null, ...plus });

describe.skipIf(!phpPresent)('analyse.php, le calcul', () => {
  const P = phpPresent ? constantePhp<Record<string, unknown>>('PLAFONDS_DEFAUT') : {};
  const HAIKU = phpPresent ? php<Ligne>('tarifEnVigueur', TARIFS, 'claude-haiku-5-5', '2026-10-14') : null;
  const tokens = (u: unknown) => php<Record<string, number>>('tokensDeUsage', u);

  describe('le cout et le journal', () => {
    it('lit les compteurs de usage tels que l API les renvoie', () => {
      expect(tokens(USAGE_P1)).toEqual({ entree: 4000, ecritureCache: 25000, ecritureCache1h: 0, lectureCache: 0, sortie: 1500 });
      expect(tokens({ input_tokens: 10, cache_creation_input_tokens: 300, cache_creation: { ephemeral_1h_input_tokens: 100 } }).ecritureCache1h).toBe(100);
      expect(tokens(null)).toEqual({ entree: 0, ecritureCache: 0, ecritureCache1h: 0, lectureCache: 0, sortie: 0 });
    });

    it('calcule le cout au tarif Batch du modele rapide, cache compris', () => {
      expect(php('coutAppel', tokens(USAGE_P1), HAIKU, true)).toBe(COUT_P1);
      expect(php('coutAppel', tokens(USAGE_P2), HAIKU, true)).toBe(COUT_P2);
      // Au tarif normal, le double ; l'estimation de la spec (une passe ~0,0014 $, cache chaud).
      expect(php('coutAppel', tokens(USAGE_P2), HAIKU, false)).toBe(0.0014);
    });

    it('passe au palier au-dela de 100 000 tokens de prompt, cache compris', () => {
      const t = { entree: 80000, ecritureCache: 0, ecritureCache1h: 0, lectureCache: 30000, sortie: 1000 };
      // 80 000 x 0,50 + 30 000 x 0,05 + 1 000 x 2,50 = 44 000 micro-dollars, moitie en Batch.
      expect(php('coutAppel', t, HAIKU, true)).toBe(0.022);
      expect(php('coutAppel', { ...t, lectureCache: 20000 }, HAIKU, true)).toBe(0.00435);
    });

    it('prend l ecriture du cache a une heure a son propre tarif', () => {
      const t = { entree: 0, ecritureCache: 50000, ecritureCache1h: 20000, lectureCache: 0, sortie: 0 };
      // 30 000 x 0,125 + 20 000 x 0,20 = 7 750 micro-dollars.
      expect(php('coutAppel', t, HAIKU, false)).toBe(0.00775);
    });

    it('choisit la ligne de tarif en vigueur ce jour-la, sans reecrire le passe', () => {
      const premiere = TARIFS.lignes[0];
      if (!premiere) throw new Error('claude-tarifs.json sans ligne');
      const t = { ...TARIFS, lignes: [...TARIFS.lignes, { ...premiere, depuis: '2027-01-01', sortie: 1 }] };
      expect(php<Ligne>('tarifEnVigueur', t, 'claude-haiku-5-5', '2026-12-31').sortie).toBe(0.5);
      expect(php<Ligne>('tarifEnVigueur', t, 'claude-haiku-5-5', '2027-01-01').sortie).toBe(1);
      expect(php('tarifEnVigueur', t, 'claude-haiku-5-5', '2026-01-01')).toBe(null);
      expect(php('coutAppel', tokens(USAGE_P1), null, true)).toBe(null);
      expect(php('passeGarde', TARIFS, t, '2027-02-01')).toBe(true);
      expect(php('passeGarde', t, TARIFS, '2027-02-01')).toBe(false);
      expect(php('passeGarde', t, TARIFS, '2026-12-01')).toBe(true);
    });

    it('livre une table des tarifs valide, verifiee sur la page officielle', () => {
      expect(php('verifierTarifs', TARIFS)).toEqual(TARIFS);
      for (const l of TARIFS.lignes) expect(l.source).toMatch(/^https:\/\/platform\.claude\.com\//);
      expect(() => php('verifierTarifs', { ...TARIFS, lignes: [{ ...TARIFS.lignes[0], entree: -1 }] })).toThrow(/tarifs/);
    });

    it('additionne les depenses d une organisation par jour et par mois', () => {
      const lignes = [
        { t: '2026-10-14T10:00:00Z', organisation: 'admin', cout: COUT_P1 },
        { t: '2026-10-13T10:00:00Z', organisation: 'admin', cout: COUT_P2 },
        { t: '2026-10-14T11:00:00Z', organisation: 'autre', cout: 1 },
        { t: '2026-10-14T12:00:00Z', organisation: 'admin', cout: null }
      ];
      expect(php('depenses', lignes, 'admin', '2026-10-14')).toEqual({ jour: COUT_P1, mois: 0.0028375 });
    });

    it('lit une ligne de resultats : sortie, refus, coupure, erreur', () => {
      expect(phpObjets('lireResultat', reussi('p1', USAGE_P1))).toMatchObject({ id: 'p1', statut: 'reussi', arret: 'end_turn', erreur: null, sortie: { forme: { valeur: 'deux-pans' } } });
      const refus = reussi('p2', USAGE_P2) as { result: { message: { stop_reason: string } } };
      refus.result.message.stop_reason = 'refusal';
      expect(phpObjets('lireResultat', refus)).toMatchObject({ statut: 'reussi', arret: 'refusal', sortie: null, erreur: { type: 'refusal' } });
      const coupe = reussi('p3', USAGE_P2) as { result: { message: { stop_reason: string } } };
      coupe.result.message.stop_reason = 'max_tokens';
      expect(phpObjets('lireResultat', coupe)).toMatchObject({ sortie: null, erreur: { type: 'max_tokens' } });
      expect(phpObjets('lireResultat', reponseParDefaut('x'))).toMatchObject({ statut: 'echoue', erreur: { type: 'overloaded_error' } });
      expect(phpObjets<{ statut: string }>('lireResultat', { custom_id: 'y', result: { type: 'expired' } }).statut).toBe('expire');
    });
  });

  describe('le prompt et le schema de chaque usage', () => {
    const lireSchema = (f: string) => JSON.parse(fs.readFileSync(path.join(deploy, f), 'utf8')) as { version: number; schema: Record<string, unknown> };
    const texte = (f: string) => fs.readFileSync(path.join(deploy, f), 'utf8');
    /** Les limites de la sortie structuree : objets fermes, tous les champs requis, ni bornes ni longueurs. */
    const verifier = (n: unknown, ou: string): void => {
      if (!n || typeof n !== 'object') return;
      const o = n as Record<string, unknown>;
      if (o.type === 'object') {
        expect(o.additionalProperties, ou).toBe(false);
        expect([...(o.required as string[])].sort(), ou).toEqual(Object.keys(o.properties as object).sort());
      }
      for (const cle of ['minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems']) expect(o[cle], ou + '.' + cle).toBeUndefined();
      for (const [k, v] of Object.entries(o)) verifier(v, ou + '.' + k);
    };
    /** Chaque terme d'une liste fermee du schema, sauf les termes communs. */
    const termes = (n: unknown, communs: string[]): string[] => {
      const vus = new Set<string>();
      const lire = (x: unknown): void => {
        if (!x || typeof x !== 'object') return;
        const o = x as Record<string, unknown>;
        if (Array.isArray(o.enum)) for (const t of o.enum as string[]) vus.add(t);
        for (const v of Object.values(o)) lire(v);
      };
      lire(n);
      return [...vus].filter((t) => !communs.includes(t));
    };

    it('versionne le prompt et le schema de l analyse, et le schema tient les limites de la sortie structuree', () => {
      const p = php<{ version: number; texte: string }>('lirePrompt', texte('prompt-analyse.md'));
      expect(p.version).toBe(9);
      expect(p.texte).toMatch(/^# Rôle/);
      expect(p.texte).not.toMatch(/^version:/m);
      expect(SCHEMA.version).toBe(5);
      verifier(SCHEMA.schema, 'schema');
      // Les formes et les termes des facades sont definis dans le prompt : un mot hors liste n'a pas de sens pour Claude.
      const proprietes = SCHEMA.schema.properties as { forme: unknown; facades: { items: { properties: { materiau: unknown; details: unknown } } } };
      const facade = proprietes.facades.items.properties;
      for (const t of termes([proprietes.forme, facade.materiau, facade.details], ['indetermine', 'oui', 'non'])) expect(texte('prompt-analyse.md'), t).toContain('`' + t + '`');
    });

    it('versionne le prompt et le schema du run d une facade, generes, et definit chaque terme', () => {
      const p = php<{ version: number; texte: string }>('lirePrompt', texte('prompt-facade.md'));
      expect(p.version).toBe(5);
      expect(p.texte).toMatch(/^# Rôle/);
      const s = lireSchema('schema-facade.json');
      expect(s.version).toBe(4);
      verifier(s.schema, 'schema');
      for (const t of termes(s.schema, [])) expect(texte('prompt-facade.md'), t).toContain('`' + t + '`');
      // Le serveur sert ce couple pour l'usage `facade`, et garde celui de l'analyse pour les autres.
      expect(php<[{ version: number }, { version: number }]>('promptEtSchema', 'facade').map((x) => x.version)).toEqual([5, 4]);
      // L'exemple du repli a la forme du schema : le serveur le ramene a lui-meme, sans rien ecarter ni completer.
      const exemple = (JSON.parse(texte('schema-facade.json')) as { exemple: object }).exemple;
      expect(phpObjets('sortieConforme', JSON.stringify(exemple), s.schema)).toEqual(exemple);
      expect(constantePhp<string[]>('USAGES')).toContain('facade');
      // Le renfort a trois passes est parti au lot F3 : ni usage, ni fichiers.
      expect(constantePhp<string[]>('USAGES')).not.toContain('renfort');
      expect(fs.existsSync(path.join(deploy, 'prompt-renfort.md')) || fs.existsSync(path.join(deploy, 'schema-renfort.json'))).toBe(false);
    });
    it('versionne le prompt et le schema de la lecture enrichie d une facade (lot L1), generes, et definit chaque terme', () => {
      const p = php<{ version: number; texte: string }>('lirePrompt', texte('prompt-facade-enrichie.md'));
      expect(p.version).toBe(2);
      const s = lireSchema('schema-facade-enrichie.json');
      expect(s.version).toBe(1);
      verifier(s.schema, 'schema');
      for (const t of termes(s.schema, [])) expect(texte('prompt-facade-enrichie.md'), t).toContain('`' + t + '`');
      expect(php<[{ version: number }, { version: number }]>('promptEtSchema', 'facade-enrichie').map((x) => x.version)).toEqual([2, 1]);
      // L'exemple du repli a la forme du schema ; un nombre manquant prend son -1, une baie sans cote est ecartee.
      const exemple = (JSON.parse(texte('schema-facade-enrichie.json')) as { exemple: object }).exemple;
      expect(phpObjets('sortieConforme', JSON.stringify(exemple), s.schema)).toEqual(exemple);
      const r = phpObjets<{ baies: Record<string, unknown>[]; modenature: Record<string, unknown> }>('sortieConforme', JSON.stringify({ baies: [{ u0: 0.1, u1: 0.2, v0: 0.3, v1: 0.8, menuiserie: 'Bois' }, { u0: 0.4 }] }), s.schema);
      expect(r.baies).toEqual([{ u0: 0.1, u1: 0.2, v0: 0.3, v1: 0.8, menuiserie: 'bois', couleurMenuiserie: 'indetermine', couleurVolets: 'indetermine', gardeCorps: 'indetermine', hautGardeCorps: -1, couleurGardeCorps: 'indetermine' }]);
      expect(r.modenature).toMatchObject({ rangsGenoise: -1, soubassement: -1, bandeaux: [] });
      expect(php('comptesSortie', JSON.parse(texte('schema-facade-enrichie.json')).exemple, 'facade-enrichie')).toMatchObject({ ouvertures: 3, elements: 2 });
    });

    it('versionne le prompt et le schema de la lecture du jardin (lot L3), generes, et definit chaque terme', () => {
      const p = php<{ version: number; texte: string }>('lirePrompt', texte('prompt-jardin.md'));
      expect(p.version).toBe(1);
      expect(p.texte).toMatch(/^# Rôle/);
      const s = lireSchema('schema-jardin.json');
      expect(s.version).toBe(1);
      verifier(s.schema, 'schema');
      for (const t of termes(s.schema, [])) expect(texte('prompt-jardin.md'), t).toContain('`' + t + '`');
      expect(php<[{ version: number }, { version: number }]>('promptEtSchema', 'jardin').map((x) => x.version)).toEqual([1, 1]);
      const exemple = (JSON.parse(texte('schema-jardin.json')) as { exemple: object }).exemple;
      expect(phpObjets('sortieConforme', JSON.stringify(exemple), s.schema)).toEqual(exemple);
      expect(constantePhp<string[]>('USAGES')).toContain('jardin');
      expect(constantePhp<Record<string, string>>('MODELE_PAR_USAGE').jardin).toBe('claude-haiku-5-5');
      // Ses comptes au journal : ses objets, et ceux dont la certitude est forte.
      expect(php<Record<string, number>>('comptesSortie', exemple, 'jardin')).toMatchObject({ elements: 5, determines: 2, vide: false });
    });
  });

  describe('la demande et ses parametres', () => {
    it('compte les facades de chaque requete, et refuse un compte hors bornes', () => {
      expect(php<Demande>('verifierDemande', demande(), P).requetes.map((r) => r.facades)).toEqual([2, 2]);
      const sans = demande(['p1']) as { requetes: { facades?: number }[] };
      delete sans.requetes[0]?.facades;
      expect(php<Demande>('verifierDemande', sans, P).requetes[0]?.facades).toBe(0);
      const premiere = (demande(['p1']) as { requetes: object[] }).requetes[0];
      expect(() => php('verifierDemande', { ...demande(['p1']), requetes: [{ ...premiere, facades: 201 }] }, P)).toThrow(/façades/);
    });

    it('fixe le modele, le prompt en cache, l effort et la sortie, sans temperature', () => {
      const p = phpObjets('parametresRequete', 'claude-haiku-5-5', 'PROMPT', SCHEMA.schema, [{ type: 'text', text: 'x' }]);
      expect(p).toEqual({
        model: 'claude-haiku-5-5', max_tokens: constantePhp('MAX_TOKENS'),
        // Le schema suit le prompt dans le meme bloc en cache : la sortie structuree en faisait une
        // grammaire que l'API refusait (« The compiled grammar is too large »).
        system: [{ type: 'text', text: 'PROMPT\n\n# Forme de la réponse\n\n' + constantePhp<string>('CONSIGNE_JSON') + '\n\n' + JSON.stringify(SCHEMA.schema), cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }],
        output_config: { effort: 'low' }
      });
    });

    it('n admet que des blocs texte et image, et des modeles connus', () => {
      const d = php<Demande>('verifierDemande', demande(), P);
      // Le modele rapide par defaut pour l'analyse, le modele fin pour l'escalade (decision du 29 octobre 2026).
      expect(d.modele).toBe(RAPIDE);
      expect(d.requetes.map((r) => [r.id, r.passe, r.images])).toEqual([['p1', 1, 1], ['p2', 2, 1]]);
      expect(php<Demande>('verifierDemande', { ...demande(), usage: 'escalade' }, P).modele).toBe(FIN);
      const avec = (r: object) => ({ ...demande(), requetes: [{ id: 'p1', passe: 1, contenu: [r] }] });
      expect(() => php('verifierDemande', avec({ type: 'document', source: {} }), P)).toThrow(/non admis/);
      expect(() => php('verifierDemande', avec({ type: 'image', source: { type: 'url', url: 'https://x' } }), P)).toThrow(/non admis/);
      expect(() => php('verifierDemande', { ...demande(), modele: 'claude-fable-5-1' }, P)).toThrow(/non admis/);
      expect(() => php('verifierDemande', { ...demande(), requetes: [{ id: '../x', contenu: [{ type: 'text', text: 'a' }] }] }, P)).toThrow(/Identifiant/);
      expect(() => php('verifierDemande', { ...demande(), requetes: Array.from({ length: 61 }, (_, i) => ({ id: 'r' + i, contenu: [{ type: 'text', text: 'a' }] })) }, P)).toThrow(/Trop de requêtes/);
      expect(() => php('verifierPlafonds', { ...P, defaut: { jour: -1, mois: 1 } })).toThrow(/plafonds/);
    });

    it('nomme l essai ou non, et rien d autre', () => {
      expect(php<Demande>('verifierDemande', demande(), P).essai).toBe(false);
      expect(php<Demande>('verifierDemande', { ...demande(), essai: 'brouillon' }, P).essai).toBe(true);
      expect(php<Demande>('verifierDemande', { ...demande(), essai: null }, P).essai).toBe(false);
      expect(() => php('verifierDemande', { ...demande(), essai: 'oui' }, P)).toThrow(/essai/);
    });

    it('donne a chaque requete son usage et son modele, regle ou demande', () => {
      const d = { ...demande(['p1']), requetes: [...(demande(['p1']) as { requetes: object[] }).requetes, requeteFacade('r1')] };
      expect(php<Demande>('verifierDemande', d, P).requetes.map((r) => [r.id, r.usage, r.modele])).toEqual([['p1', 'analyse', RAPIDE], ['r1', 'facade', RAPIDE]]);
      const regle = php('modelesParUsage', { usages: { analyse: FIN } });
      expect(php<Demande>('verifierDemande', d, P, regle).requetes.map((r) => r.modele)).toEqual([FIN, RAPIDE]);
      expect(php<Demande>('verifierDemande', { ...d, modele: FIN }, P).requetes.map((r) => r.modele)).toEqual([FIN, FIN]);
      expect(() => php('verifierDemande', { ...demande(['p1']), requetes: [{ ...requeteFacade('r1'), usage: 'autre' }] }, P)).toThrow(/Usage inconnu/);
      expect(() => php('verifierDemande', { ...demande(['p1']), requetes: [{ ...requeteFacade('r1'), usage: 'renfort' }] }, P)).toThrow(/Usage inconnu/);
    });

    it('dans une demande escalade, une requete garde le prompt de son usage, prend le modele de l escalade et se compte en escalade', () => {
      const regle = php('modelesParUsage', { usages: { escalade: FIN } });
      const d = { ...demande([]), usage: 'escalade', requetes: [{ ...requeteFacade('e1'), facades: 0 }, { ...(demande(['p1']) as { requetes: object[] }).requetes[0], usage: 'analyse', facades: 0 }] };
      const lu = php<{ requetes: { id: string; usage: string; compte: string; modele: string }[] }>('verifierDemande', d, P, regle).requetes.map((r) => [r.id, r.usage, r.compte, r.modele]);
      expect(lu).toEqual([['e1', 'facade', 'escalade', FIN], ['p1', 'analyse', 'escalade', FIN]]);
      // Hors escalade, la requete se compte sous son usage.
      expect(php<{ requetes: { compte: string }[] }>('verifierDemande', { ...demande([]), usage: 'facade', requetes: [requeteFacade('r1')] }, P, regle).requetes[0]).toMatchObject({ usage: 'facade', compte: 'facade', modele: RAPIDE });
    });

    it('annonce l escalade d une facade : son modele et ses prix du jour', () => {
      const tarifs = { lignes: [{ modele: FIN, depuis: '2026-10-13', entree: 2, sortie: 10 }, { modele: FIN, depuis: '2026-11-01', entree: 3, sortie: 15 }] };
      expect(php('escaladeFacade', { escalade: FIN }, tarifs, '2026-10-29')).toEqual({ modele: FIN, prix: { entree: 2, sortie: 10 } });
      expect(php('escaladeFacade', { escalade: RAPIDE }, tarifs, '2026-10-29')).toEqual({ modele: RAPIDE, prix: null });
    });
  });

  describe('le modele de chaque usage', () => {
    // Le modele rapide partout (15 octobre 2026), sauf l'escalade (29 octobre 2026) : elle ne part qu'a la demande, apres trois
    // lectures votees du modele rapide, qu'une quatrieme du meme modele ne departagerait pas.
    const defaut = { analyse: RAPIDE, escalade: FIN, immediat: RAPIDE, candidats: RAPIDE, rejeu: RAPIDE, facade: RAPIDE, 'facade-enrichie': RAPIDE, plu: RAPIDE, jardin: RAPIDE };

    it('prend le modele rapide par defaut pour tous les usages sauf l escalade, au modele fin, parmi deux admis', () => {
      expect(constantePhp('MODELE_PAR_USAGE')).toEqual(defaut);
      expect(constantePhp('MODELES')).toEqual([RAPIDE, FIN]);
      expect(php('modelesParUsage', null)).toEqual(defaut);
    });

    it('suit le reglage, et retombe sur le defaut pour un modele qui n est plus admis', () => {
      expect(php('modelesParUsage', { format: 'plan-claude-modeles', usages: { analyse: FIN, facade: 'claude-ancien-1', renfort: FIN } })).toEqual({ ...defaut, analyse: FIN });
      expect(php('modelesParUsage', { usages: 'n importe quoi' })).toEqual(defaut);
    });

    it('refuse un modele hors de la liste ou un usage inconnu', () => {
      expect(php('verifierModeles', { format: 'plan-claude-modeles', usages: { analyse: RAPIDE } })).toEqual({ format: 'plan-claude-modeles', usages: { analyse: RAPIDE } });
      expect(() => php('verifierModeles', { format: 'plan-claude-modeles', usages: { analyse: 'claude-fable-5-1' } })).toThrow(/non admis/);
      expect(() => php('verifierModeles', { format: 'plan-claude-modeles', usages: { autre: RAPIDE } })).toThrow(/Usage inconnu/);
      expect(() => php('verifierModeles', { format: 'autre', usages: {} })).toThrow(/réglage des modèles/);
    });
  });

  describe('la forme de la reponse', () => {
    it('ramene une reponse ecrite sans sortie structuree a la forme du schema, sans rien inventer', () => {
      type Sortie = Record<string, unknown> & { facades: unknown[] };
      const s = phpObjets<Sortie>('sortieConforme', TEXTE_DESORDONNE, SCHEMA.schema);
      // Le texte autour et le bloc de code sont laisses ; la graphie des termes est celle du vocabulaire.
      expect(s.forme).toEqual({ indices: [{ image: 2, vu: 'pignon sur rue' }], valeur: 'deux-pans' });
      expect(s.bouts).toEqual({ indices: [], gauche: 'pignon', droite: 'indetermine' });
      expect(s.lucarnes).toEqual({ indices: [], nombre: 'indetermine', types: ['jacobine'], pan: 'indetermine' });
      // Un element hors vocabulaire n'est pas remplace par un autre : il est ecarte.
      expect(s.elements).toEqual([{ indices: [], element: 'verriere' }]);
      expect(s.facades[0]).toMatchObject({ facade: 'sud', ouvertures: { niveaux: 2, parNiveau: [3, 4], manquees: 'indetermine', enTrop: 'indetermine' }, materiau: 'meuliere', ecart: '' });
      expect(s.confiance).toBe('forte');
      expect(s).not.toHaveProperty('enTrop');
      expect(Object.keys(s)).toEqual(Object.keys((SCHEMA.schema as { properties: object }).properties));
      // Sans objet JSON, rien n'est lu ; sans confiance, la plus prudente.
      expect(phpObjets('sortieConforme', 'Je ne peux pas analyser ces images.', SCHEMA.schema)).toBeNull();
      expect(phpObjets('sortieConforme', '[1, 2]', SCHEMA.schema)).toBeNull();
      expect(phpObjets<Record<string, unknown>>('sortieConforme', '{}', SCHEMA.schema).confiance).toBe('faible');
    });

    it('compte les baies, les bouts, les lucarnes, les elements et les ecarts de l analyse', () => {
      expect(php('comptesSortie', SORTIE_ANALYSE, 'analyse')).toEqual(TROUVE_ANALYSE);
      expect(php('comptesSortie', SORTIE_ANALYSE, 'escalade')).toEqual(TROUVE_ANALYSE);
      expect(php('comptesSortie', SORTIE_VIDE, 'analyse')).toEqual(TROUVE_VIDE);
    });

    it('compte les baies, les angles, les pointes, les elements et la forme du run d une facade', () => {
      expect(php('comptesSortie', SORTIE_FACADE, 'facade')).toEqual(TROUVE_FACADE);
      const muet = { ...SORTIE_FACADE, calage: { ...SORTIE_FACADE.calage, angles: { gauche: 'indetermine', droite: 'indetermine' }, pointes: [] }, forme: { silhouette: 'indetermine', bout: 'indetermine' }, ouvertures: [], elements: [] };
      expect(php('comptesSortie', muet, 'facade')).toEqual(TROUVE_VIDE);
    });

    it('ramene le run d une facade a son schema : angle manquant indetermine, baie sans cote ecartee, carreaux completes', () => {
      const SCHEMA_FACADE = JSON.parse(fs.readFileSync(path.join(deploy, 'schema-facade.json'), 'utf8')) as { schema: Record<string, unknown> };
      type Sortie = { calage: { angles: Record<string, unknown> }; ouvertures: Record<string, unknown>[]; confiance: string };
      const brut = { calage: { angles: { gauche: { x: 0.1, egout: 0.5, sol: 0.9, confiance: 'Forte' } }, pointes: [{ u: 0.5, v: 2 }] },
        ouvertures: [{ type: 'Fenêtre', u0: 0.1, u1: 0.2, v0: 0.3, v1: 0.8 }, { type: 'porte', u0: 0.4, v0: 0, v1: 0.8 }] };
      const s = phpObjets<Sortie>('sortieConforme', 'Voici : ' + JSON.stringify(brut), SCHEMA_FACADE.schema);
      // Version 4 du schema (aucune union) : l'angle manquant a ses nombres a -1, sa valeur par defaut (`default`), que le lecteur ecarte.
      expect(s.calage.angles).toEqual({ gauche: { x: 0.1, egout: 0.5, sol: 0.9, confiance: 'forte' }, droite: { x: -1, egout: -1, sol: -1, confiance: 'indetermine' } });
      // « Fenêtre » est ramene a la graphie du vocabulaire ; la baie sans `u1` (une cote manque) est ecartee, rien n'est invente.
      expect(s.ouvertures.map((o) => o.type)).toEqual(['fenetre']);
      const bon = phpObjets<Sortie>('sortieConforme', JSON.stringify({ ouvertures: [{ type: 'fenetre', u0: 0.1, u1: 0.2, v0: 0.3, v1: 0.8 }] }), SCHEMA_FACADE.schema);
      expect(bon.ouvertures[0]).toEqual({ type: 'fenetre', u0: 0.1, u1: 0.2, v0: 0.3, v1: 0.8, niveau: -1, travee: -1, confiance: 'indetermine',
        details: { volets: 'indetermine', allege: 'indetermine', forme: 'indetermine' },
        carreaux: { vantaux: -1, colonnes: -1, rangees: -1, petitsBois: 'indetermine', imposte: -1, imposteColonnes: -1, imposteRangees: -1, vitrage: 'indetermine' } });
      // Un compte dit `indetermine` (le vocabulaire d'avant la version 4, que le repli peut encore rendre) prend sa valeur par defaut.
      const ancien = phpObjets<Sortie>('sortieConforme', JSON.stringify({ ouvertures: [{ type: 'fenetre', u0: 0.1, u1: 0.2, v0: 0.3, v1: 0.8, niveau: 'indetermine', carreaux: { colonnes: 'indetermine', rangees: 3 } }] }), SCHEMA_FACADE.schema);
      expect(ancien.ouvertures[0]).toMatchObject({ niveau: -1, carreaux: { colonnes: -1, rangees: 3 } });
      expect(bon.confiance).toBe('faible');
    });

    it('lit l objet d une reponse sans sortie structuree : bloc de code, accolades autour, premier jet, virgule finale', () => {
      // La forme qui faisait « Sortie non JSON » : de la premiere accolade a la derniere, rien ne se lit.
      const t = TEXTE_FACADE_SANS_FORMAT;
      expect(() => JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1))).toThrow();
      expect(phpObjets('objetJsonDuTexte', t)).toEqual(SORTIE_FACADE);
      // Le dernier objet qui se lit, accolades des chaines comprises ; une virgule finale en dernier recours.
      expect(phpObjets('objetJsonDuTexte', '{"a": 1, "b": "x}"} puis {"a": 2}')).toEqual({ a: 2 });
      expect(phpObjets('objetJsonDuTexte', 'Note {u0, u1} : {"a": 3, "l": [1, 2,], }')).toEqual({ a: 3, l: [1, 2] });
      expect(php('objetsEquilibres', 'a {b {c}} d {"e": "}"} {f')).toEqual(['{b {c}}', '{"e": "}"}']);
      expect(phpObjets('objetJsonDuTexte', 'Je ne vois pas de façade.')).toBeNull();
    });

    it('demande la sortie structuree quand on la veut, et reconnait son refus par l API', () => {
      const SCHEMA_FACADE = JSON.parse(fs.readFileSync(path.join(deploy, 'schema-facade.json'), 'utf8')) as { schema: Record<string, unknown> };
      expect(constantePhp('SORTIE_STRUCTUREE')).toEqual(['facade', 'facade-enrichie', 'plu', 'jardin']);
      const p = phpObjets<{ output_config: unknown; system: { text: string }[] }>('parametresRequete', 'claude-haiku-5-5', 'PROMPT', SCHEMA_FACADE.schema, [{ type: 'text', text: 'x' }], true);
      expect(p.output_config).toEqual({ effort: 'low', format: { type: 'json_schema', schema: SCHEMA_FACADE.schema } });
      // Avec la sortie structuree, le schema ne part plus dans le prompt ; sans elle, l'exemple s'il y en a un, sinon le schema.
      expect(p.system[0]?.text).toBe('PROMPT\n\n# Forme de la réponse\n\n' + constantePhp<string>('CONSIGNE_STRUCTUREE'));
      const exemple = { calage: { angles: { gauche: 'indetermine' } } };
      const repli = phpObjets<{ system: { text: string }[]; output_config: unknown }>('parametresRequete', 'claude-haiku-5-5', 'PROMPT', SCHEMA_FACADE.schema, [{ type: 'text', text: 'x' }], false, exemple);
      expect(repli.system[0]?.text).toBe('PROMPT\n\n# Forme de la réponse\n\n' + constantePhp<string>('CONSIGNE_EXEMPLE') + '\n\n' + JSON.stringify(exemple));
      expect(repli.system[0]?.text).not.toContain('additionalProperties');
      expect(repli.output_config).toEqual({ effort: 'low' });
      const erreur = (type: string, message: string) => ({ custom_id: 'f', result: { type: 'errored', error: { type: 'error', error: { type, message } } } });
      // Le message du refus est garde (le resultat et le journal le portent) ; une autre erreur ne se rejoue pas.
      expect(phpObjets('formatRefuse', erreur('invalid_request_error', 'output_config.format: The compiled grammar is too large'))).toBe('output_config.format: The compiled grammar is too large');
      expect(phpObjets('formatRefuse', erreur('invalid_request_error', 'Schema is too complex for compilation.'))).toBe('Schema is too complex for compilation.');
      expect(phpObjets('formatRefuse', erreur('invalid_request_error', 'messages.0.content.0.image: invalid base64'))).toBeNull();
      expect(phpObjets('formatRefuse', erreur('overloaded_error', 'schema'))).toBeNull();
      expect(phpObjets('formatRefuse', reussi('f', USAGE_P1))).toBeNull();
    });

    it('ne prend pas le schema recopie, valeurs logees dedans, pour une reponse vide', () => {
      // La forme que Haiku a rendue sur la vraie API quand le schema partait en texte (run 40896695970).
      const copie = texteSqueletteDuSchema(schemaFacade());
      expect(JSON.parse(copie)).toHaveProperty('properties.calage.properties.angles.properties.droite.egout', 258);
      expect(phpObjets('sortieConforme', copie, schemaFacade())).toBeNull();
      expect(phpObjets('lireResultat', reussiTexte('f', USAGE_P1, copie), schemaFacade())).toMatchObject({ sortie: null, erreur: { type: 'sortie_illisible', message: 'Sortie hors du schéma.' } });
      // Un objet vide reste une reponse a completer (la plus prudente), comme avant.
      expect(phpObjets('sortieConforme', '{}', schemaFacade())).not.toBeNull();
    });

    it('dit, pour une sortie illisible, le debut du texte rendu', () => {
      const prose = 'Je ne peux pas lire cette façade : '.repeat(20);
      const e = phpObjets<{ erreur: { type: string; message: string; apercu: string } }>('lireResultat', reussiTexte('f', USAGE_P1, prose)).erreur;
      expect(e).toMatchObject({ type: 'sortie_illisible', message: 'Sortie non JSON.' });
      expect(e.apercu).toBe(prose.trim().slice(0, 400));
      const vide = reussi('g', USAGE_P1) as { result: { message: { content: unknown[] } } };
      vide.result.message.content = [{ type: 'thinking', thinking: '' }];
      expect(phpObjets('lireResultat', vide)).toMatchObject({ erreur: { type: 'sortie_illisible', message: 'Aucun bloc de texte.', apercu: '' } });
    });

    it('borne un nombre aberrant, ignore une forme inattendue, et ne compte que les reponses lues', () => {
      expect(php('comptesSortie', { facades: [{ ouvertures: { parNiveau: [5000, -2, 1.5, '3'], manquees: 1e9 } }] }, 'analyse')).toMatchObject({ ouvertures: 999, manquees: 999 });
      expect(php('comptesSortie', [], 'analyse')).toEqual(TROUVE_VIDE);
      expect(php('comptesSortie', 'texte', 'facade')).toEqual(TROUVE_VIDE);
      expect(php('comptesSortie', null, 'analyse')).toBe(null);
      expect(php('trouvailles', { statut: 'reussi', erreur: null, sortie: SORTIE_VIDE }, 'analyse')).toEqual(TROUVE_VIDE);
      expect(php('trouvailles', { statut: 'reussi', erreur: { type: 'max_tokens', message: '' }, sortie: null }, 'analyse')).toBe(null);
      expect(php('trouvailles', { statut: 'echoue', erreur: { type: 'overloaded_error', message: '' }, sortie: null }, 'analyse')).toBe(null);
    });
  });

  describe('la consommation', () => {
    it('lit les filtres, trente jours par defaut, et refuse ce qui est mal forme', () => {
      expect(php('lireFiltres', {}, '2026-10-14')).toEqual({ du: '2026-09-15', au: '2026-10-14', organisation: null, modele: null, usage: null, parcelle: null });
      expect(php('lireFiltres', { du: '2026-10-01', au: '2026-10-14', modele: 'claude-sonnet-5-5', parcelle: '78650000AE0101', usage: 'escalade', organisation: 'org-1' }, '2026-10-14'))
        .toEqual({ du: '2026-10-01', au: '2026-10-14', organisation: 'org-1', modele: 'claude-sonnet-5-5', usage: 'escalade', parcelle: '78650000AE0101' });
      expect(() => php('lireFiltres', { du: '2026-10-15', au: '2026-10-14' }, '2026-10-14')).toThrow(/Période/);
      expect(() => php('lireFiltres', { du: '2026-02-30' }, '2026-10-14')).toThrow(/Période/);
      expect(() => php('lireFiltres', { du: '2024-01-01', au: '2026-10-14' }, '2026-10-14')).toThrow(/trop longue/);
      expect(() => php('lireFiltres', { modele: 'gpt' }, '2026-10-14')).toThrow(/modele/);
      expect(() => php('lireFiltres', { parcelle: '../x' }, '2026-10-14')).toThrow(/parcelle/);
      expect(php('moisEntre', '2025-11-20', '2026-02-03')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
      expect(php('decalerJour', '2026-03-01', -1)).toBe('2026-02-28');
    });

    it('ne rend que les lignes de la periode et des filtres, reduites aux compteurs', () => {
      const lignes = [
        ligneJournal('2026-10-01T08:00:00Z'),
        ligneJournal('2026-10-02T08:00:00Z', { modele: 'claude-sonnet-5-5', usage: 'escalade' }),
        ligneJournal('2026-10-03T08:00:00Z', { idu: '78650000AE0102', organisation: 'org-1' }),
        ligneJournal('2026-09-30T23:59:59Z')
      ];
      const lire = (f: Record<string, unknown>) => php<Record<string, unknown>[]>('filtrerConsommation', lignes, f);
      const tout = lire(filtre());
      expect(tout).toHaveLength(3);
      expect(Object.keys(tout[0] ?? {})).toEqual(['t', 'organisation', 'projet', 'idu', 'adresse', 'audit', 'usage', 'modele', 'batch', 'idBatch', 'passe', 'tokens', 'images', 'facades', 'cout', 'statut', 'trouve']);
      expect(lire(filtre({ modele: 'claude-sonnet-5-5' })).map((l) => l.usage)).toEqual(['escalade']);
      expect(lire(filtre({ parcelle: '78650000AE0102' })).map((l) => l.organisation)).toEqual(['org-1']);
      expect(lire(filtre({ organisation: 'org-1', usage: 'analyse' }))).toHaveLength(1);
      // Une ligne d'avant les comptes : `trouve` et `idBatch` a null.
      const ancienne = { t: '2026-10-02T08:00:00Z', organisation: 'admin', usage: 'analyse', modele: RAPIDE, batch: true, statut: 'reussi', cout: 0.001 };
      expect(php<Record<string, unknown>[]>('filtrerConsommation', [ancienne], filtre())[0]).toMatchObject({ trouve: null, idBatch: null });
    });

    it('donne a chaque organisation ses depenses du jour et du mois face a ses plafonds', () => {
      const p = { ...P, organisations: { 'org-1': { jour: 0.5, mois: 5 } } };
      const lignes = [ligneJournal('2026-10-14T08:00:00Z'), ligneJournal('2026-10-02T08:00:00Z'), ligneJournal('2026-10-14T09:00:00Z', { organisation: 'org-2', cout: 0.01 })];
      expect(php('etatOrganisations', lignes, p, '2026-10-14')).toEqual([
        { id: 'admin', jour: COUT_P1, mois: 2 * COUT_P1, plafond: { jour: 1, mois: 10 } },
        { id: 'org-1', jour: 0, mois: 0, plafond: { jour: 0.5, mois: 5 } },
        { id: 'org-2', jour: 0.01, mois: 0.01, plafond: { jour: 1, mois: 10 } }
      ]);
      expect(php('choixConsommation', lignes, p)).toEqual({
        organisations: ['admin', 'org-1', 'org-2'], modeles: [RAPIDE, FIN],
        usages: ['analyse', 'escalade', 'immediat', 'candidats', 'rejeu', 'facade', 'facade-enrichie', 'plu', 'jardin'], parcelles: [{ idu: '78650000AE0101', adresse: '2 allée des Limites, Le Vésinet' }]
      });
    });
  });

  describe('le brouillon des regles', () => {
    it('lit le prompt et le schema, garde leurs versions, refuse ce que le serveur ne saurait pas envoyer', () => {
      const b = php<Record<string, unknown>>('verifierBrouillonRegles', BROUILLON);
      expect(b).toMatchObject({ format: 'plan-regles-brouillon', versionPrompt: 10, versionSchema: 6, etat: BROUILLON.etat });
      expect(php('vueBrouillonRegles', b)).toEqual({ enregistreLe: b.enregistreLe, prompt: 10, schema: 6 });
      expect(() => php('verifierBrouillonRegles', null)).toThrow(/illisible/);
      expect(() => php('verifierBrouillonRegles', { ...BROUILLON, prompt: 'sans en-tete' })).toThrow(/en-tete/);
      expect(() => php('verifierBrouillonRegles', { ...BROUILLON, prompt: '---\nversion: 10\n---\n  \n' })).toThrow(/vide/);
      expect(() => php('verifierBrouillonRegles', { ...BROUILLON, schema: '[]' })).toThrow(/Schéma/);
      // `[]` et `{}` se lisent pareil en PHP (json_decode en tableaux) : seul un etat qui n'est pas un objet est refuse.
      expect(() => php('verifierBrouillonRegles', { ...BROUILLON, etat: 'texte' })).toThrow(/état/);
      expect(php('vueBrouillonRegles', null)).toBeNull();
    });
  });

  describe('les audits et la conformite', () => {
    it('verifie la forme d un audit', () => {
      expect(php('verifierAudit', fichierAudit())).toEqual({ nature: 'parcelle', idu: '78650000AE0101', adresse: '2 allée des Limites' });
      expect(php('verifierAudit', { format: 'plan-audit', version: 2, promenade: { commune: 'Le Vésinet' }, cas: [] })).toEqual({ nature: 'promenade', idu: '', adresse: 'Le Vésinet', commune: 'Le Vésinet' });
      expect(() => php('verifierAudit', { format: 'plan-audit', version: 3, promenade: {}, cas: [] })).toThrow('Version du fichier de promenade inconnue.');
      expect(php<{ idu: string }>('verifierAudit', fichierAudit('48.900000,2.130000')).idu).toBe('48.900000,2.130000');
      expect(() => php('verifierAudit', { ...fichierAudit(), version: 2 })).toThrow('Version du fichier d’audit inconnue.');
      expect(() => php('verifierAudit', { ...fichierAudit(), parcelle: { idu: '../x' } })).toThrow('Parcelle du fichier d’audit invalide.');
    });

    it('resume un audit pour le catalogue, et lit la marque du depot', () => {
      const photo = { type: 'image/jpeg', base64: 'AAAA' };
      const audit = { ...fichierAudit(), finCapture: null, batiments: [{ photos: [photo], facades: [{ photos: [photo, photo] }, null] }, null], cloture: { photos: [photo] }, portail: {} };
      expect(php('resumeAudit', audit)).toEqual({ photos: 4, phase: 'capture', debut: '2026-10-13T08:00:00.000Z', propositions: { total: 0, claude: 0, mesures: 0, validees: 0, refusees: 0, enAttente: 0 } });
      expect(php('resumeAudit', { ...audit, finCapture: '2026-10-13T08:30:00Z', debut: 'hier' })).toMatchObject({ phase: 'analyse', debut: null });
      expect(php('marqueAudit', '')).toBe('corpus');
      expect(php('marqueAudit', '', 'sauvegarde')).toBe('sauvegarde');
      expect(php('marqueAudit', 'sauvegarde')).toBe('sauvegarde');
      expect(() => php('marqueAudit', 'brouillon')).toThrow('Marque de dépôt inconnue (corpus ou sauvegarde).');
    });

    it('nomme les dossiers des audits', () => {
      expect(php('nomSur', 'Le Vésinet', 'x', true)).toBe('le-vesinet');
      expect(php('nomSur', '48.900000,2.130000', 'x')).toBe('48-900000-2-130000');
      expect(php('nomSur', '  ', 'sans-commune', true)).toBe('sans-commune');
      expect(php('nomSur', 'Saint-Germain-en-Laye (78)', 'x', true)).toBe('saint-germain-en-laye-78');
      expect(php('dossierRelatifAudit', { id: '20261013-154200-0000abcd', nature: 'parcelle', idu: '78650000AE0101' })).toBe('parcelle/78650000AE0101/20261013-154200-0000abcd');
      expect(php('dossierRelatifAudit', { id: '20261013-154200-0000abcd', nature: 'promenade', commune: 'Île-de-Bréhat' })).toBe('promenade/ile-de-brehat/20261013-154200-0000abcd');
    });

    it('verifie la forme d une mesure de conformite', () => {
      const m = mesureEssai('2026-10-14T10:00:00Z');
      expect(php('verifierMesureConformite', m)).toEqual(m);
      expect(() => php('verifierMesureConformite', { ...m, format: 'autre' })).toThrow('Ce n’est pas une mesure de conformité.');
      expect(() => php('verifierMesureConformite', { ...m, t: 'hier' })).toThrow('Date de la mesure invalide.');
      expect(() => php('verifierMesureConformite', { ...m, toits: { ...m.toits, conformes: '1' } })).toThrow('Résumé de la mesure invalide.');
      expect(() => php('verifierMesureConformite', { ...m, parRegion: null })).toThrow('Mesure de conformité incomplète.');
    });
  });
});

import { describe, it, expect } from 'vitest';
import { adresseDuReglement, chercherReglements, telechargerReglement } from '../../../src/geo/reglementPlu.js';

// L'adresse du reglement d'une zone au Geoportail de l'urbanisme (lot L4), d'apres les proprietes de `zone-urba`.

const CHATOU = { gpu_doc_id: 'd900b44519db2d309cb7c160688df167', partition: 'DU_78146', libelle: 'ULp', libelong: 'ULp : Secteur urbain',
  nomfic: '78146_reglement_20181003.pdf#page=38', urlfic: null, idurba: '78146_PLU_20181003' };

describe('adresseDuReglement', () => {
  it('construit l’adresse de data.geopf.fr et lit la page de la zone', () => {
    expect(adresseDuReglement(CHATOU)).toEqual({
      url: 'https://data.geopf.fr/annexes/gpu/documents/DU_78146/d900b44519db2d309cb7c160688df167/78146_reglement_20181003.pdf', page: 38,
      zone: 'ULp', libelong: 'ULp : Secteur urbain', document: '78146_PLU_20181003', partition: 'DU_78146',
    });
  });

  it('ignore une urlfic hors de data.geopf.fr (une archive de la metropole), et prend la sienne quand elle y pointe', () => {
    const rennes = { gpu_doc_id: '2c2ee6ad54e64d1365fadad608767a71', partition: 'PSMV_35238', libelle: 'psmv', nomfic: '35238_reglement_20240206.pdf',
      urlfic: 'https://public.sig.rennesmetropole.fr/ressources/donnees/urbanisme/psmv/envigueur/3_reglement/d01_rl.zip', idurba: '35238_PSMV_20240206' };
    expect(adresseDuReglement(rennes)).toMatchObject({ url: 'https://data.geopf.fr/annexes/gpu/documents/PSMV_35238/2c2ee6ad54e64d1365fadad608767a71/35238_reglement_20240206.pdf', page: null });
    expect(adresseDuReglement({ ...CHATOU, urlfic: 'https://data.geopf.fr/annexes/gpu/documents/DU_1/abc/r.pdf#page=7', nomfic: null })).toMatchObject({ url: 'https://data.geopf.fr/annexes/gpu/documents/DU_1/abc/r.pdf', page: 7 });
  });

  it('ne construit rien sans fichier PDF ou sans identifiant de document', () => {
    expect(adresseDuReglement({ ...CHATOU, nomfic: 'reglement.zip' })).toBeNull();
    expect(adresseDuReglement({ ...CHATOU, gpu_doc_id: '../x' })).toBeNull();
    expect(adresseDuReglement({ ...CHATOU, partition: 'DU/78' })).toBeNull();
  });
});

describe('chercherReglements et telechargerReglement', () => {
  it('relit la zone au point, par la meme requete que l’interrogation du PLU', async () => {
    const vues: string[] = [];
    const r = await chercherReglements(2.1606, 48.8935, async (url) => { vues.push(url); return { features: [{ properties: CHATOU }, { properties: { libelle: 'N' } }] }; });
    expect(vues[0]).toBe('https://apicarto.ign.fr/api/gpu/zone-urba?geom=' + encodeURIComponent('{"type":"Point","coordinates":[2.1606,48.8935]}'));
    expect(r.map((a) => a.zone)).toEqual(['ULp']);
  });

  it('refuse ce qui n’est pas un PDF, et dit pourquoi', async () => {
    const pdf = new TextEncoder().encode('%PDF-1.4 …');
    expect(await telechargerReglement('u', async () => new Response(pdf))).toEqual(pdf);
    await expect(telechargerReglement('u', async () => new Response('<html>'))).rejects.toThrow(/n’est pas un PDF/);
    await expect(telechargerReglement('u', async () => new Response('', { status: 404 }))).rejects.toThrow(/HTTP 404/);
    await expect(telechargerReglement('u', async () => { throw new TypeError('reseau'); })).rejects.toThrow(/ne se télécharge pas/);
  });
});

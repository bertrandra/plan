// `/?version` : la description du produit (model/produit.ts), lisible par une personne.
//
// La plateforme, elle, lit le bloc `<script type="application/json" id="plan-produit">` de la page
// sans executer de JavaScript ; cette page-ci montre le meme JSON a qui ouvre l'adresse dans un
// navigateur — un exploitant qui verifie ce qui est en ligne. Le bloc fait foi : c'est lui qui est
// affiche, et la description calculee ne sert que s'il manque (sous `vite` sans le greffon).

import { ID_DESCRIPTION, descriptionProduit } from '../model/produit.js';
import { BACKPROD_PRODUCT_CODE } from '../plateforme/config.js';

export function afficherDescription(doc: Document = document): string {
  const bloc = doc.getElementById(ID_DESCRIPTION)?.textContent;
  let description: unknown;
  try { description = bloc ? JSON.parse(bloc) : null; } catch { description = null; }
  const texte = JSON.stringify(description ?? descriptionProduit(BACKPROD_PRODUCT_CODE), null, 2);
  doc.title = 'Plan — version';
  const pre = doc.createElement('pre');
  pre.id = 'descriptionProduit';
  pre.textContent = texte;
  doc.body.replaceChildren(pre);
  return texte;
}

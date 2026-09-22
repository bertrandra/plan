// Les deux constantes que le build injecte (vite.config.ts, `define`).
//
// Declarees ici plutot que lues depuis `import.meta.env` : une constante remplacee au build
// disparait du paquet quand personne ne la lit, et se voit telle quelle dans le fichier livre
// quand quelqu'un la lit. `import.meta.env` aurait embarque tout l'objet.

declare const __BACKPROD_API_URL__: string;
declare const __BACKPROD_PRODUCT_CODE__: string;

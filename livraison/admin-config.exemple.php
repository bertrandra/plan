<?php
// Configuration de l'admin des demos (admin.php, MD/spec-demos-admin.md).
//
// 1. Copier ce fichier sous le nom `plan-admin-config.php` a cote de `public_html/` (au-dessus de
//    la racine web, pas dedans) : il n'est alors jamais servi. Vaut aussi pour Plan en sous-dossier.
//    A defaut, le copier a cote d'admin.php sous le nom `admin-config.php` ; .htaccess en refuse
//    l'acces direct.
// 2. Remplacer le mot de passe. Tant qu'il vaut « A-CHANGER », l'admin n'existe pas.
//    Il peut etre ecrit en clair, ou sous forme de hachage : php -r 'echo password_hash("...", PASSWORD_DEFAULT);'
// 3. `dossierDonnees` : ou ranger les donnees du serveur, toutes dans un dossier `data/` HORS du
//    dossier publie, a cote de public_html/ (une mise en ligne qui remplace public_html/ ne les
//    emporte pas), avec un sous-dossier par nature : demo/ (les fichiers de demo et de la vitrine ?mode=demo), admin/ (palette,
//    controleurs), claude/ (journal des appels, tarifs, plafonds, modeles, batches), audits/ (les
//    audits de parcelle et de promenade recus, leurs analyses et rejeux), conformite/ (deploy/donnees.php).
//    Sans ce reglage : `data/` a cote de public_html/. Une configuration d'avant qui ne dit que
//    `dossierDemos` garde l'ancienne disposition (tout dans ce dossier) ; quand `dossierDonnees` est
//    la, un ancien plan-demos/ est deplace dans data/ au premier passage (data/migration.json le dit).
// 4. `anthropicCle` : la cle d'API Anthropic de l'analyse par Claude (analyse.php,
//    MD/spec-audit.md 13.2). Elle ne quitte jamais le serveur. Tant qu'elle vaut « A-CHANGER »,
//    l'analyse repond 503 et rien n'est envoye a Anthropic. Les plafonds par jour et par mois
//    (1 $ et 10 $ par defaut) se reglent dans `data/claude/plafonds.json`.
// 5. `plateformeUrl` : l'origine de la plateforme (backprod). Un utilisateur connecte a Plan lance
//    l'analyse avec son jeton, que analyse.php verifie aupres d'elle (`/api/v1/me/context`) ; son
//    organisation est celle du journal et des plafonds. Par defaut https://www.raillard.org.
//    Le meme jeton sert a partager un audit de parcelle pour le corpus (MD/spec-audit.md 15) : les
//    audits recus se rangent dans `data/audits/`.

return [
    'motDePasse' => 'A-CHANGER',
    'dossierDonnees' => __DIR__ . '/data',
    'anthropicCle' => 'A-CHANGER',
    'plateformeUrl' => 'https://www.raillard.org',
];

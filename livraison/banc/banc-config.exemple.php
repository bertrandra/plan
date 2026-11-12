<?php
// Configuration du banc d'apprentissage des facades. A copier HORS du dossier publie, a cote de public_html/,
// sous le nom banc-config.php, puis changer le mot de passe. Ce fichier-ci (l'exemple) ne se sert jamais.
return [
  // Le mot de passe du banc, en clair. Ou mieux : 'motDePasseHash' => password_hash('…', PASSWORD_DEFAULT).
  'motDePasse' => 'A-CHANGER',
  // Ou vivent les photos et le marquage : par defaut data/apprentissage/ a cote de ce fichier (hors de public_html/).
  // 'dossierDonnees' => __DIR__ . '/data/apprentissage',
];

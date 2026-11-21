# Revue d'ergonomie et de style du board (2026-11-21)

Revue page par page des captures (ordinateur et mobile, données simulées), avec le skill `.claude/skills/ui-review`. Toutes les vues ont été reprises (détail plus bas) ; les constats transverses sont réglés.

## Ce qui marche

- **Tokens.** L'or ne sert qu'en fond, et le texte d'accent a son propre token.
- **Cibles et formes.** Les cibles de clic sont suffisantes, et les boutons pilule, les rayons et les ombres sont les mêmes partout.
- **Types de contenu.** Chaque type a sa couleur et est toujours nommé en texte.
- **Connexions.** Le motif « Gérer » replie les services déjà réglés.
- **Profil.** Il applique le style `danger` à la suppression de compte.

## Constats transverses

| Sévérité | Constat                                                                                                                     | Correction                                                                                         |
| -------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Haute    | Trop de boutons dorés : un par carte dans les listes, par section dans les réglages. Plus rien ne ressort.                  | Un `primary` par vue ou par formulaire. Dans les listes, `data-size="small"`. Fait.                |
| Haute    | Tuiles de score et liserés de carte différents entre Veille, Conversations et Création.                                     | Un même motif de carte (liseré du type de contenu) et un seul style de score. Fait.                |
| Haute    | Aides éloignées de leur champ (Diffusion > LinkedIn, Tri > types).                                                          | Une `.hint` sous chaque champ, reliée par `aria-describedby`. Fait.                                |
| Moyenne  | Titres de section construits de trois façons (`legend` à cheval sur la bordure, `h2` dans la carte, `h2` hors de la carte). | Titre visible dans la carte, `legend` masquée visuellement. Fait.                                  |
| Moyenne  | « Supprimer », « Retirer ce type », « Supprimer la clé » ont l'air de boutons neutres.                                      | `data-variant="danger"`, en fin de rangée. Fait.                                                   |
| Moyenne  | Erreurs et états de clé affichés de façons différentes (texte rouge gras ou maigre, lien vert, texte seul).                 | Badges `data-tone` avec point pour les états. Pour les erreurs, une `.notice` de ton danger. Fait. |
| Moyenne  | Liens pas toujours soulignés (« Où trouver cette clé ? »). Titres de carte soulignés sur certaines pages, pas sur d'autres. | Souligner tout lien en ligne. Une règle unique pour les titres de carte. Fait.                     |
| Basse    | Boutons « Enregistrer » grisés tant que rien n'a changé : peu lisibles, sans explication.                                   | Tranché : enregistrement automatique des textes, avec « Enregistré ». Fait.                        |
| Basse    | Largeurs de page variables (Profil, Connexions, le reste).                                                                  | Une ou deux largeurs de contenu, en tokens. Fait.                                                  |

## Par page (à reprendre)

- Rien pour l’instant. Les écrans d’administration et la création d’un thème n’ont eu que des retouches légères (voir plus bas).

## Fait dans cette passe

- **Veille** :
  - le titre et « Ajouter un lien » sont sur une même ligne (`.page-head`) ;
  - les cartes sont plus compactes, avec le liseré du type ;
  - le titre mène à la fiche et le site à la source ;
  - l'analyse est en retrait ;
  - la date, le site et les boutons (petits) sont sur une même ligne ;
  - l'état de la rédaction est un badge ;
  - « Contenu promotionnel » est en ton neutre.
- **Fiche** :
  - en-tête en trois temps : état, analyse, puis outils (source, Création, type de contenu) ;
  - la Diffusion remonte juste après l'état de la rédaction, avec un liseré doré d'étape suivante ;
  - les posts passent avant les résumés ;
  - le liseré de l'état de la rédaction était écrasé par `.block` : il est corrigé.
- Carte « Rédaction prête » :
  - deux lignes au lieu d'un grand bloc ;
  - icône alignée sur le titre, bouton « Relancer » petit à droite ;
  - sur la deuxième ligne, ce qui est conservé et « Fournir le texte de la source ».
- Brouillons de posts :
  - l'état du post (badge) passe au-dessus du texte au lieu de flotter sous le premier commentaire ;
  - chaque réseau est séparé par un filet et plus d'espace.
- **Aujourd'hui** :
  - le chiffre et le libellé d'une tuile restent groupés, même quand une tuile voisine est plus haute ;
  - une flèche dit que la tuile mène quelque part ;
  - un thème sans rien en attente tient sur une ligne, « Rien en attente pour l'instant. ».
- **Aperçu** :
  - « Mettre en pause » (petit) passe sous l'état, sur ordinateur comme sur mobile, avec son effet en retrait à côté ;
  - en pause, l'effet de la reprise reprend la taille du texte courant.
- **Conversations** :
  - même carte que la Veille, avec le liseré du type, le même style de score, les métadonnées et les boutons (petits) sur une ligne ;
  - « Comment aider » passe avant l'extrait, réduit à deux lignes en citation discrète ;
  - le badge « Répondre » ne s'affiche plus (le bouton le dit) ; seuls « Surveiller » et « Passer » gardent un badge ;
  - sur mobile, les boutons tiennent sur une ligne.
- **Création** :
  - le titre et les actions sont dans un `.page-head`, « Nouveau post » en premier, « Planifier une série » en petit ;
  - chaque groupe (Idées, Brouillons, Programmés, Publiés) a une ligne d'explication, même espacement.
- **Calendrier** :
  - « Liste / Semaine » devient un sélecteur segmenté compact (onglets Reka, pilule pleine pour la vue choisie), avec le fuseau horaire sur la même ligne ;
  - les posts programmés de Création rejoignent la liste datée et la semaine, avec leur liseré violet ; chaque carte dit son outil (« Veille », « Création ») à côté de l’heure ;
  - les boutons de navigation de la semaine sont petits.
- **Réglages, tous les onglets** :
  - un seul motif de section : une carte (`.section-card`) avec son titre dedans, `legend` flottante ou `h2` (`.section-title`), l’aide juste dessous ; les groupes internes sont séparés par un filet (`.subsection`) au lieu de cartes imbriquées ;
  - un formulaire d’une seule carte a son « Enregistrer » au pied de la carte ; un formulaire sur plusieurs cartes, sous la dernière, avec le message d’état à côté ;
  - une même largeur pour tous les onglets ; sur mobile, les panneaux fermés ne laissent plus d’espace vide.
- **Réglages, Général** :
  - les langues forment une liste bordée, « Retirer » petit et en rouge en fin de ligne (absent quand il ne reste qu’une langue) ; « Ajouter » sur la ligne du menu ;
  - la description de chaque outil est sous sa case, dans la même grille.
- **Réglages, Sources** :
  - par source : « Modifier » et « Collecter maintenant » petits et neutres, « Supprimer » petit, rouge, en dernier ;
  - la dernière erreur est une `.notice` de ton danger avec icône ;
  - « Sources de conversations » est séparé des sources de la veille par plus d’espace.
- **Réglages, Tri** :
  - chaque type tient sur une ligne (nom, définition sur une ligne, « Modifier » et « Retirer ») ; « Modifier » déplie ses champs (`aria-expanded`), un nouveau type s’ouvre déjà ; l’aide de la définition est sous son champ ;
  - collecte et tri par IA, qui s’enregistraient déjà ensemble, forment un seul formulaire avec un seul bouton ;
  - la page passe d’environ 2 900 à 1 800 px.
- **Réglages, Publication** :
  - le fuseau horaire n’est plus tronqué ;
  - les erreurs de compte et de conflit sont des `.notice` de ton danger avec icône ; les comptes forment une liste bordée ;
  - chaque aide LinkedIn (signature, premier commentaire) est sous son champ, pour chaque langue.
- **Premier commentaire** (fiche et réglages) : le titre est dans le cadre, plus à cheval sur la bordure ; son bouton est petit.
- **Newsletter, Flux publics, Voix, Conversations, Création, Budget** : même motif de cartes ; les adresses des flux en liste bordée avec « Copier » petit, « Désactiver les flux » en rouge ; l’expéditeur n’est plus tronqué.
- **Largeur** : un token `--width-content` (46 rem) donne la même largeur aux panneaux de réglages, aux Connexions, au Profil, à la série et à l’Administration.
- **Connexions** :
  - un groupe (Collecte et IA, Diffusion, Newsletter, MCP) = une carte, titre dedans ; les services sont des lignes séparées par un filet ;
  - chaque service tient sur une ligne repliée : nom, état en badge (`data-tone` et point), à quoi il sert, et un bouton petit « Gérer » ou « Configurer » (`aria-expanded`, le même bouton replie) ; seule une clé refusée s’ouvre d’elle-même ;
  - une clé refusée et les erreurs sont des `.notice` de ton danger avec icône ; « Se termine par » passe en aide ;
  - « Où trouver cette clé ? » est souligné ; « Supprimer la clé » et « Retirer l’accès » sont petits, rouges, en fin de rangée ;
  - la page passe d’environ 3 900 à 2 200 px.
- **Profil** : même motif de cartes que les réglages ; le badge « Propriétaire » est sur la ligne du nom de l’espace, son aide sous le titre ; les messages vides ne laissent plus de blanc ; la zone de suppression reste rouge.
- **Éditeur de Création** :
  - en-tête : état en badge (Brouillon, Programmé, Publié), date de modification ;
  - chaque étape est une carte : Sujet et matière, Images, une carte d’état compacte de la rédaction (comme sur la fiche), la Publication avec le liseré doré d’étape suivante, puis les posts ;
  - « Rédiger les posts » est le bouton doré tant qu’il n’y a pas de posts, puis devient petit (« Rédiger à nouveau ») : un seul doré à la fois ;
  - les posts sont groupés par réseau avec un filet, l’état de chaque post (badge) avant son texte, l’erreur en `.notice` avec le lien vers Connexions ;
  - les réseaux tiennent sur une ligne, l’aide sous les cases ; les liens donnés forment une liste bordée, « Retirer » petit et rouge ;
  - images : aperçu plus étroit, boutons petits, « Retirer » en fin de rangée, bouton de fichier au style du board, « Proposé par l’IA » en badge ;
  - « Supprimer ce brouillon » est petit, en fin de page.
- **Série** : le plan est une carte, chaque post un groupe séparé par un filet (plus de cartes dans la carte), « Retirer » petit et rouge, « Ajouter un post » petit sous la liste, « Créer et rédiger les brouillons » en premier au pied.
- **Création d’un thème et ajustement** (retouches) : l’aide d’une réponse est collée à son champ ; l’introduction de l’ajustement suit son titre de près.
- **Administration** (retouches) : sections en cartes, titre dedans ; les clés de Pann sont des lignes séparées par un filet, état en badge, « Supprimer la clé » petit et rouge ; les demandes d’accès en lignes, boutons petits ; les dépenses du mois séparées du formulaire de plafonds par un filet.
- **Enregistrement automatique** (décision de Geoffrey) : textes des posts et des résumés, premier commentaire, textes alternatifs des images et « Sujet et matière » s’enregistrent seuls, une seconde après la frappe, en quittant le champ et en quittant la page. La page le dit une fois dans son en-tête ; chaque champ montre son état en badge discret à droite de son libellé (« Enregistrement… », « Enregistré », ou l’erreur). Seule l’issue est annoncée aux lecteurs d’écran. Les formulaires de réglages gardent leur bouton.
- **Fiche d’un élément à trier** : elle aide à juger la source, plus à vérifier des textes. La carte d’état de la rédaction laisse place à « Ce que dit la source » (début du texte lu à la collecte, date de publication, « Lire la suite ») puis à la décision (« Valider » doré, « Rejeter »), avec ce que la validation déclenche. Un élément rejeté propose « Remettre à trier ».
- **Aperçu** : en pause, « Reprendre » devient le bouton doré de la page.
- **Conversations** : plus de badge de conseil (« Surveiller », « Passer ») dans l’onglet « À répondre » : la personne a déjà choisi.
- **Sous-formulaires** : leur « Enregistrer » est petit et doré (renommage de l’espace, éditeur de source).
- **Connexions** : plus de « Remplacer la clé » ; changer de clé, c’est la supprimer puis en donner une nouvelle (le champ prend le focus). La suppression est un bouton icône rond (disque rouge clair, corbeille rouge) au bout de la ligne « Se termine par », motif `.icon-button` dans `base.css`.
- **Éditeur de Création** : « Sujet et matière » se replie une fois les posts rédigés, en une ligne (sujet, point de départ, réseaux) avec « Modifier ».
- **Titres de carte** : une seule règle (`.title > a` dans `base.css`) pour la Veille, les Conversations, Création, le Calendrier et l’historique : souligné discret, plein au survol.
- **Erreurs d’action** (échec d’une rédaction, d’un envoi, d’un enregistrement) : `.notice` de ton danger avec icône partout ; le texte rouge seul reste réservé aux erreurs d’un champ, sous ce champ.
- **Sources** (remarques de Geoffrey) : trois sous-onglets, « Sources de la veille », « Sources des conversations », « Exclusions » (`?sub=`) ; les sources des conversations ne s’affichent plus sous celles de la veille. « Ajouter des sources » depuis Conversations mène à leur onglet. « Points minimum d’un sujet » a une aide sous le champ (ce que sont les points, l’effet de 0 et de 10, les commentaires toujours gardés) : une aide visible plutôt qu’une infobulle, lue avec le champ et accessible au toucher.

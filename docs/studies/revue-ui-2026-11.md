# Revue d'ergonomie et de style du board (2026-11-21)

Revue page par page des captures (ordinateur et mobile, données simulées), avec le skill `.claude/skills/ui-review`. Fait dans la même passe : Veille (liste) et fiche d'un élément. Le reste est à reprendre vue par vue.

## Ce qui marche

- **Tokens.** L'or ne sert qu'en fond, et le texte d'accent a son propre token.
- **Cibles et formes.** Les cibles de clic sont suffisantes, et les boutons pilule, les rayons et les ombres sont les mêmes partout.
- **Types de contenu.** Chaque type a sa couleur et est toujours nommé en texte.
- **Connexions.** Le motif « Gérer » replie les services déjà réglés.
- **Profil.** Il applique le style `danger` à la suppression de compte.

## Constats transverses

| Sévérité | Constat                                                                                                                     | Correction                                                                                                       |
| -------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Haute    | Trop de boutons dorés : un par carte dans les listes, par section dans les réglages. Plus rien ne ressort.                  | Un `primary` par vue ou par formulaire. Dans les listes, `data-size="small"`.                                    |
| Haute    | Tuiles de score et liserés de carte différents entre Veille, Conversations et Création.                                     | Un même motif de carte (liseré du type de contenu) et un seul style de score.                                    |
| Haute    | Aides éloignées de leur champ (Diffusion > LinkedIn, Tri > types).                                                          | Une `.hint` sous chaque champ, reliée par `aria-describedby`.                                                    |
| Moyenne  | Titres de section construits de trois façons (`legend` à cheval sur la bordure, `h2` dans la carte, `h2` hors de la carte). | Titre visible dans la carte, `legend` masquée visuellement.                                                      |
| Moyenne  | « Supprimer », « Retirer ce type », « Supprimer la clé » ont l'air de boutons neutres.                                      | `data-variant="danger"`, en fin de rangée.                                                                       |
| Moyenne  | Erreurs et états de clé affichés de façons différentes (texte rouge gras ou maigre, lien vert, texte seul).                 | Badges `data-tone` avec point pour les états. Pour les erreurs, une `.notice` de ton danger.                     |
| Moyenne  | Liens pas toujours soulignés (« Où trouver cette clé ? »). Titres de carte soulignés sur certaines pages, pas sur d'autres. | Souligner tout lien en ligne. Une règle unique pour les titres de carte.                                         |
| Basse    | Boutons « Enregistrer » grisés tant que rien n'a changé : peu lisibles, sans explication.                                   | À trancher : enregistrement automatique avec « Enregistré », ou bouton affiché seulement après une modification. |
| Basse    | Largeurs de page variables (Profil, Connexions, le reste).                                                                  | Une ou deux largeurs de contenu, en tokens.                                                                      |

## Par page (à reprendre)

- **Connexions** : la page fait environ 3 900 px ; replier aussi les services non réglés, derrière « Configurer ».

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

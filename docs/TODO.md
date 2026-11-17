# Idées et choses à faire

Liste vivante : une ligne passe dans `DECISIONS.md` (et sort d'ici) quand elle est faite.

## Prochaine mission : découverte, onboarding et création de posts

Décidée le 2026-11-16. Détail, maquettes de parcours et justification : `docs/studies/onboarding-ia.md`.

1. **Valider (S)** : 5 tests de premier lancement en pensée à voix haute, dont une personne avec lecteur d'écran ; test d'arborescence actuelle contre proposée ; essai de Buffer, Hootsuite et Publer ; case « Créer mes propres posts : bientôt » pour mesurer l'intérêt.
2. **Correctifs rapides (S à M)** : état vide de l'accueil avec un bouton, slogan à jour, création de thème simplifiée, lien de la barre latérale pour un thème sans curation, Diffusion et Programmés réunis.
3. **Parcours sans IA (M)** : objectif, puis réseaux (avec « autre réseau »), formulaire guidé, relecture avant enregistrement, page Aperçu avec liste de démarrage, première collecte immédiate.
4. **Conversation de cadrage (L)** : un échange borné qui remplit la configuration du thème, toujours relu avant enregistrement, avec un formulaire de repli et une interface de discussion accessible.
5. **Nouvelle architecture (M à L)** : séparer « faire » et « régler », un Calendrier commun (Diffusion, Programmés, Newsletter), Réglages regroupés par sujet, redirections des anciennes adresses.
6. **Créer mes propres posts, première version (L)** : sujets libres, recherche avant rédaction, posts ancrés dans leurs sources, programmation dans le Calendrier.
7. **Différenciateurs (M)** : voix de l'auteur en réglages, séries de posts, idées tirées de la veille et des conversations, contrôle d'accessibilité des posts.

À trancher avant de démarrer (liste complète dans l'étude) :

- Qui paie l'IA pendant l'onboarding ? Un crédit fourni par Pann déroge à la règle des clés par espace.
- Inscription libre ou sur invitation ?
- Version allégée maintenant et refonte avec l'outil de création, ou tout d'un coup ?
- Noms des sections : Aperçu, Veille, Conversations, Création, Calendrier, Aujourd'hui.

## Idées

- **Offres et page de tarifs** (modèle du 2026-11-17, remplace celui du 2026-11-12 ; résumé aussi dans `docs/CONTEXT.md`, section 12) :
  1. **Offre « clés personnelles »**, environ 2 € par mois avec engagement d'un an : l'utilisateur apporte ses propres clés (IA, Zernio, Exa…) et règle ses budgets en dollars, comme aujourd'hui.
  2. **Offre intermédiaire**, au mois ou à l'année : Pann fournit l'IA et les services. On parle de budget en **tokens**, jamais en dollars, pour effacer la comparaison avec le coût d'achat. Nombre de réseaux limité.
  3. **Offre supérieure** : le même service, plus cher, avec des quotas plus élevés.
  4. **Enterprise** : sur mesure, négociée directement avec Geoffrey.
  - **À faire à part de la refonte** : analyse des prix de la concurrence (Buffer, Hootsuite, Publer…), puis prix et quotas de chaque offre (tokens par mois, nombre de réseaux, de thèmes).
  - À prévoir : facturation (Stripe), compteur de tokens par espace, IA fournie par Pann, mode « comptes gérés par Pann » pour Zernio, choix de l'offre dans l'onboarding.
- **Streak de publication** : compter les semaines d'affilée avec au moins une publication, l'afficher, et prévenir quand la semaine en cours n'a encore rien de programmé (« vous êtes sur le point de casser votre streak, choisissez des éléments à publier »). Préciser le canal de la notification (dans le board, par e-mail).
- **Pause de la collecte** : réglage « au-delà de N éléments dans À trier, Pann se met en pause », pour ne pas accumuler plus qu'on ne peut trier (et ne pas payer le tri par IA pour rien). Reprise automatique sous le seuil.

## À corriger

- **Ordre instable des listes** : des éléments validés ou rejetés semblent changer de place dans les listes du tri. Trouver un ordre stable (clé de tri secondaire unique, par exemple date puis identifiant) et vérifier ce que fait le rafraîchissement après une action.
- **Onglets et filtres qui défilent** : masquer la barre de défilement horizontale et indiquer le débordement par un fondu à gauche ou à droite, sans perdre l'accès au clavier ni la visibilité de l'onglet courant.

## Déjà évoqué

- **Doublons** : URL canonique de la page, normalisation (AMP, `m.`, `index.html`), regroupement par sujet au tri (branche prévue `feat/dedup`).
- **Zernio en mode plateforme** pour un produit SaaS : une clé Pann, un profil Zernio par espace, boutons « Connecter » dans les réglages, facturation au compte connecté (voir zernio.com/use-cases/saas-platforms).
- **Engagement** : rédaction d'une proposition de réponse, « marquer comme répondu », plafond de réponses par communauté et par semaine.
- **Fiche source partagée** : les résumés d'une source réutilisés d'un thème à l'autre.
- **Transfert de propriété** d'un espace de travail (aujourd'hui, un propriétaire avec d'autres membres ne peut pas supprimer son compte).
- **Inscription à la newsletter** depuis une page publique de Pann (double confirmation chez le service d'envoi).

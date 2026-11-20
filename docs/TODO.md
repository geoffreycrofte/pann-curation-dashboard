# Idées et choses à faire

Liste vivante : une ligne passe dans `DECISIONS.md` (et sort d'ici) quand elle est faite.

## Prochaine mission : découverte, onboarding et création de posts

Décidée le 2026-11-16, arbitrée le 2026-11-17 : **tout d'un coup**, sans version allégée ni redirections. Détail et réponses de Geoffrey : `docs/studies/onboarding-ia.md`.

1. **Valider (S)** : tests de premier lancement en pensée à voix haute, dont une personne avec lecteur d'écran ; test d'arborescence ; essai de Buffer, Hootsuite et Publer.
2. **Fondations** :
   - **Espace d'admin** (compte de Geoffrey seulement) : clés de Pann (IA, Zernio en mode plateforme, Resend) et centre de coûts du crédit Pann. _Fait._
   - **Toutes les langues pour les contenus** : un thème publie dans n'importe quelle langue, l'interface reste en français et en anglais. _Fait._
   - **Demande d'accès motivée**, envoyée par e-mail à Geoffrey avec Resend (l'inscription reste sur invitation). _Fait._
3. **Onboarding** : objectif, réseaux (avec « autre réseau », demandes traitées et priorisées), conversation de cadrage payée par le crédit Pann, relecture avant enregistrement, Aperçu avec liste de démarrage, première collecte immédiate. _Fait_, y compris « Ajuster avec l'assistant » et le souhait de newsletter.
4. **Nouvelle architecture** : Aujourd'hui (tous thèmes), puis par thème Aperçu, Veille, Conversations, Création, Calendrier (créneaux distincts par outil), Réglages regroupés par sujet. La métaphore de l'orpaillage sort du board. _Fait._
5. **Création, première version (L)** : les 5 réseaux actuels, recherche avant rédaction, posts ancrés dans leurs sources, images dans l'offre intermédiaire. _Fait_ (trois modes : mes idées, liens, recherche ; vos propres images avec texte alternatif obligatoire). Reste : génération d'images par IA avec l'offre intermédiaire.
6. **Différenciateurs (M)** : voix de l'auteur en réglages, séries de posts, idées tirées de la veille et des conversations, contrôle d'accessibilité des posts. _Fait._ Reste : regrouper les questions récurrentes des conversations en idées.
7. **Ensuite** : élargir les réseaux de Création.

## Idées

- **Offres et page de tarifs** (modèle du 2026-11-17, remplace celui du 2026-11-12 ; résumé aussi dans `docs/CONTEXT.md`, section 12) :
  1. **Offre « clés personnelles »**, environ 2 € par mois avec engagement d'un an : l'utilisateur apporte ses propres clés (IA, Zernio, Exa…) et règle ses budgets en dollars, comme aujourd'hui.
  2. **Offre intermédiaire**, au mois ou à l'année : Pann fournit l'IA et les services. On parle de budget en **tokens**, jamais en dollars, pour effacer la comparaison avec le coût d'achat. Nombre de réseaux limité.
  3. **Offre supérieure** : le même service, plus cher, avec des quotas plus élevés.
  4. **Enterprise** : sur mesure, négociée directement avec Geoffrey.
  - **À faire à part de la refonte** : analyse des prix de la concurrence (Buffer, Hootsuite, Publer…), puis prix et quotas de chaque offre (tokens par mois, nombre de réseaux, de thèmes).
  - À prévoir : facturation (Stripe), compteur de tokens par espace, IA fournie par Pann, mode « comptes gérés par Pann » pour Zernio (fait le 2026-11-19, activé par espace dans l'admin ; reste à le relier aux offres), choix de l'offre dans l'onboarding.
  - **Assistant au-delà du crédit** (décidé le 2026-11-18) : une fois l'espace sous une offre, « Ajuster avec l'assistant » passe sur la clé de l'espace (offre « clés personnelles ») ou sur le budget du thème (offres où Pann fournit l'IA) quand le crédit de l'assistant est épuisé. Aujourd'hui, le bouton disparaît.
- **Streak de publication** : compter les semaines d'affilée avec au moins une publication, l'afficher, et prévenir quand la semaine en cours n'a encore rien de programmé (« vous êtes sur le point de casser votre streak, choisissez des éléments à publier »). Préciser le canal de la notification (dans le board, par e-mail).
- **Pause de la collecte** : réglage « au-delà de N éléments dans À trier, Pann se met en pause », pour ne pas accumuler plus qu'on ne peut trier (et ne pas payer le tri par IA pour rien). Reprise automatique sous le seuil.

## Déjà évoqué

- **Doublons** : URL canonique de la page, normalisation (AMP, `m.`, `index.html`), regroupement par sujet au tri (branche prévue `feat/dedup`).
- **Zernio en mode plateforme** pour un produit SaaS : une clé Pann, un profil Zernio par espace, boutons « Connecter » dans les réglages, facturation au compte connecté (voir zernio.com/use-cases/saas-platforms).
- **Engagement** : rédaction d'une proposition de réponse, « marquer comme répondu », plafond de réponses par communauté et par semaine.
- **Fiche source partagée** : les résumés d'une source réutilisés d'un thème à l'autre.
- **Transfert de propriété** d'un espace de travail (aujourd'hui, un propriétaire avec d'autres membres ne peut pas supprimer son compte).
- **Inscription à la newsletter** depuis une page publique de Pann (double confirmation chez le service d'envoi).

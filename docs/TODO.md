# Idées et choses à faire

Liste vivante : une ligne passe dans `DECISIONS.md` (et sort d'ici) quand elle est faite.

## Prochaine mission : découverte, onboarding et création de posts

Décidée le 2026-11-16, arbitrée le 2026-11-17 : **tout d'un coup**, sans version allégée ni redirections. Détail et réponses de Geoffrey : `docs/studies/onboarding-ia.md`.

1. **Valider (S)** : tests de premier lancement en pensée à voix haute, dont une personne avec lecteur d'écran ; test d'arborescence ; essai de Buffer, Hootsuite et Publer.
2. **Fondations** :
   - **Espace d'admin** (compte de Geoffrey seulement) : clés de Glimr (IA, Zernio en mode plateforme, Resend) et centre de coûts du crédit Glimr. _Fait._
   - **Toutes les langues pour les contenus** : un thème publie dans n'importe quelle langue, l'interface reste en français et en anglais. _Fait._
   - **Demande d'accès motivée**, envoyée par e-mail à Geoffrey avec Resend (l'inscription reste sur invitation). _Fait._
3. **Onboarding** : objectif, réseaux (avec « autre réseau », demandes traitées et priorisées), conversation de cadrage payée par le crédit Glimr, relecture avant enregistrement, Aperçu avec liste de démarrage, première collecte immédiate. _Fait_, y compris « Ajuster avec l'assistant » et le souhait de newsletter.
4. **Nouvelle architecture** : Aujourd'hui (tous thèmes), puis par thème Aperçu, Veille, Conversations, Création, Calendrier (créneaux distincts par outil), Réglages regroupés par sujet. La métaphore de l'orpaillage sort du board. _Fait._
5. **Création, première version (L)** : les 5 réseaux actuels, recherche avant rédaction, posts ancrés dans leurs sources, images dans l'offre intermédiaire. _Fait_ (trois modes : mes idées, liens, recherche ; vos propres images avec texte alternatif obligatoire). Reste : génération d'images par IA avec l'offre intermédiaire.
6. **Différenciateurs (M)** : voix de l'auteur en réglages, séries de posts, idées tirées de la veille et des conversations, contrôle d'accessibilité des posts. _Fait._ Reste : regrouper les questions récurrentes des conversations en idées.
7. **Ensuite** : élargir les réseaux de Création.

## Idées

- **Comptes inactifs** (décidé le 2026-11-22, annoncé dans la politique de confidentialité et les conditions générales) : un compte sans connexion depuis un an est supprimé, après un e-mail d'avertissement envoyé un mois avant. À faire : tâche planifiée qui repère les comptes inactifs, envoie l'avertissement (Resend), puis supprime le compte et ses espaces dont il est le seul propriétaire.
- **Offres et page de tarifs** (modèle du 2026-11-17, remplace celui du 2026-11-12 ; résumé aussi dans `docs/CONTEXT.md`, section 12) :
  1. **Offre « clés personnelles »**, environ 2 € par mois avec engagement d'un an : l'utilisateur apporte ses propres clés (IA, Zernio, Exa…) et règle ses budgets en dollars, comme aujourd'hui.
  2. **Offre intermédiaire**, au mois ou à l'année : Glimr fournit l'IA et les services. On parle de budget en **tokens**, jamais en dollars, pour effacer la comparaison avec le coût d'achat. Nombre de réseaux limité.
  3. **Offre supérieure** : le même service, plus cher, avec des quotas plus élevés.
  4. **Enterprise** : sur mesure, négociée directement avec Geoffrey.
  - **Analyse de la concurrence faite** (2026-11-21) : `docs/studies/tarifs-concurrence.md`. Reste à fixer les prix et les quotas ; thèmes par offre proposés par Geoffrey : 2, 3 et 5, sur mesure au-delà. Page de tarifs : comparaison « sans Glimr / avec Glimr » à la façon d'Odoo, concurrents nommés en exemple, « tarifs relevés en 2026 » en petit.
  - **Fait (2026-11-21 et 22)** : offre par espace et limites (admin), tokens pondérés, IA et recherche fournies par Glimr avec quota, limite de thèmes, prix, essai de 14 jours, paiement Stripe (Checkout, portail, webhook), page de tarifs. **Reste** : créer les produits et les prix dans Stripe et régler les clés dans l'admin ; décider du sort des espaces `legacy` ; limite des comptes LinkedIn et Facebook ; relier le mode « comptes gérés par Glimr » de Zernio aux offres.
  - **Liens affiliés** (idée de Geoffrey, 2026-11-21) : surtout pour l'offre « clés personnelles », où la personne ouvre ses propres comptes. Conseiller les services que Glimr sait utiliser (Zernio, Brevo, SendFox, et Mailchimp ou d'autres services d'envoi s'ils sont ajoutés) avec un lien affilié, sur la page Connexions et dans l'onboarding : une offre peu chère, et un revenu en recommandant ces services. À vérifier pour chacun : existence d'un programme, commission, conditions (mention obligatoire du lien affilié). Mailchimp n'est pas encore pris en charge par Glimr.
  - **Assistant au-delà du crédit** (décidé le 2026-11-18) : une fois l'espace sous une offre, « Ajuster avec l'assistant » passe sur la clé de l'espace (offre « clés personnelles ») ou sur le budget du thème (offres où Glimr fournit l'IA) quand le crédit de l'assistant est épuisé. Aujourd'hui, le bouton disparaît.
- **Streak de publication** : compter les semaines d'affilée avec au moins une publication, l'afficher, et prévenir quand la semaine en cours n'a encore rien de programmé (« vous êtes sur le point de casser votre streak, choisissez des éléments à publier »). Préciser le canal de la notification (dans le board, par e-mail).

## Déjà évoqué

- **Zernio en mode plateforme** pour un produit SaaS : une clé Glimr, un profil Zernio par espace, boutons « Connecter » dans les réglages, facturation au compte connecté (voir zernio.com/use-cases/saas-platforms).
- **Fiche source partagée** : les résumés d'une source réutilisés d'un thème à l'autre.
- **Transfert de propriété** d'un espace de travail (aujourd'hui, un propriétaire avec d'autres membres ne peut pas supprimer son compte).
- **Inscription à la newsletter** depuis une page publique de Glimr (double confirmation chez le service d'envoi).

# Idées et choses à faire

Liste vivante : une ligne passe dans `DECISIONS.md` (et sort d'ici) quand elle est faite.

## Idées

- **Réseaux sans Zernio** : intégrer en direct un maximum de réseaux (comme Mastodon aujourd'hui), pour ne plus dépendre de Zernio ni de son abonnement là où une API ouverte existe. Vérifier pour chaque réseau l'API de publication, l'authentification et le coût.
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

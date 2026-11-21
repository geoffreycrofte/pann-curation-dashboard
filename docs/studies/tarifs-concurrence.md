# Prix de la concurrence et coûts de Pann

Étude du 2026-11-21, pour fixer le prix et les quotas des offres (`docs/CONTEXT.md`, section 12). Les pages de prix n'étaient pas toutes lisibles depuis la session : les chiffres viennent des pages des éditeurs quand elles l'étaient, sinon de résumés de recherche ou de sites tiers (marqués « tiers »). Tous les prix sont en dollars, hors taxes, sauf mention. À revérifier sur les pages avant de publier une grille.

## En bref

- **Personne ne fait ce que fait Pann en un seul outil.** La publication (Buffer, Publer, Later…), la veille avec IA (Feedly, Inoreader) et le repérage de conversations (Syften, Octolens, F5Bot) sont vendus séparément. Une personne seule qui assemble les trois paie de 25 à 60 $ par mois, une petite équipe bien plus.
- **Le repérage de conversations est la partie chère du marché** : 30 à 50 $ chez les outils indépendants, 159 à 249 $ chez Octolens et Brand24. C'est l'argument de l'offre intermédiaire.
- **La publication seule est bon marché** : 4 à 6 $ par réseau (Publer, Buffer), 16 à 20 $ pour un forfait (Metricool, Later, ContentStudio). Pann ne gagnera pas sur ce terrain-là.
- **Le coût de Pann par client vient surtout de Zernio** (comptes LinkedIn et Facebook), puis de la rédaction par IA. Exa est négligeable.
- **Le tri sur Haiku 4.5 coûte dix fois trop cher** : Haiku 5.5 fait le même travail à 0,10 $ / 0,50 $ par million de tokens, contre 1 $ / 5 $. À tester avant de fixer les quotas.
- **Proposition à discuter** : clés personnelles à 2 € par mois (24 € par an), offre intermédiaire autour de 19 € par mois, offre supérieure autour de 49 € par mois, avec 20 % de remise à l'année.

## Ce que coûte la concurrence

### Publication sur les réseaux

| Outil         | Entrée                                         | Petite équipe                     | Comment le prix grandit                     | IA                                    | Veille, RSS                       |
| ------------- | ---------------------------------------------- | --------------------------------- | ------------------------------------------- | ------------------------------------- | --------------------------------- |
| Buffer        | gratuit (3 réseaux, 10 posts) ; 5 $ par réseau | 10 $ par réseau (Team)            | par réseau                                  | incluse, « illimitée »                | non (idées seulement)             |
| Publer        | 4 $ par compte (5 $ au mois)                   | 8 $ par compte (Business)         | par compte, 1 sur 10 offert                 | « illimitée » en Business             | RSS automatique dès 4 $           |
| Later         | 18,75 $ (8 profils, 30 posts par profil)       | 37,50 $ (2 utilisateurs)          | par lot de profils                          | 5, 50 ou 100 crédits ; 3,75 $ les 100 | non ; pas de X, Bluesky, Mastodon |
| Metricool     | 16 € (5 marques)                               | 43 € (15 marques)                 | par paliers de marques ; X en option à 10 € | incluse, sans limite affichée         | non trouvé                        |
| ContentStudio | 19 $ (5 comptes)                               | 42 $ (10 comptes, 2 utilisateurs) | par paliers de comptes                      | 25 000 à 125 000 crédits de texte     | flux et RSS dès 42 $              |
| Typefully     | environ 8 $ (1 jeu de réseaux, tiers)          | environ 18 $ par jeu (tiers)      | par jeu de réseaux                          | incluse                               | non                               |
| Taplio        | 32 $ sans IA                                   | 49 $ (250 crédits IA)             | par paliers d'IA                            | c'est ce qui sépare les offres        | bibliothèque de posts LinkedIn    |
| Hootsuite     | 99 $ par utilisateur                           | 199 $ par utilisateur             | par utilisateur                             | 100 crédits                           | tendances, écoute payante         |

Prix à l'année, ramenés au mois. Les essais durent de 7 à 14 jours ; les offres gratuites s'arrêtent à 3 réseaux et une dizaine de posts.

### Veille avec IA

| Outil     | Offre                            | Prix par mois                    | IA                                                                                                     |
| --------- | -------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Feedly    | Pro / Pro+                       | 6 $ / 12 $ (à l'année seulement) | Pro+ seulement (flux IA) ; pas d'essai                                                                 |
| Inoreader | Pro                              | 7,50 $ (9,99 $ au mois)          | **1 million de tokens par mois**, davantage en option ; **clé IA personnelle** dans une option payante |
| Inoreader | Team                             | dès 44,99 $ pour 3 personnes     | 5 ou 10 millions de tokens partagés                                                                    |
| Feedly    | Market Intelligence (entreprise) | dès 1 600 $                      | complète                                                                                               |

Inoreader vend déjà l'IA des deux façons prévues pour Pann : un quota de tokens et la clé personnelle.

### Repérer des conversations

| Outil     | Entrée                                         | Intermédiaire                               | Haut de gamme | IA                                             |
| --------- | ---------------------------------------------- | ------------------------------------------- | ------------- | ---------------------------------------------- |
| F5Bot     | gratuit (5 mots-clés) ; 11,92 $ (20 mots-clés) | 45,75 $ (200 mots-clés)                     | 197 $         | filtrage par IA dès 45,75 $                    |
| Syften    | 29,95 $ (3 filtres)                            | 49,95 $ (20 filtres)                        | 119,95 $      | filtrage par IA dès 49,95 $                    |
| ReplyGain | 22 à 29 $ (10 mots-clés)                       | 79 $                                        | 199 $         | 1 000 réponses proposées par mois dès l'entrée |
| Octolens  | 159 $ (10 mots-clés, 15 000 mentions)          | 499 $                                       | sur mesure    | filtrage par IA                                |
| Brand24   | 199 $ (3 mots-clés, 2 000 mentions)            | 299 $ (7 mots-clés, utilisateurs illimités) | 599 $         | non trouvé                                     |

Ces outils comptent en mots-clés (ou filtres) et en volume de mentions. L'IA (filtrage, réponses proposées) sert à passer à l'offre supérieure.

### Ce qui revient partout

- **La remise à l'année** va de 17 à 25 % (« 2 mois offerts » chez Buffer).
- **L'équipe est un palier**, pas un prix par personne (Inoreader Team, Brand24 Team, Later Growth). Seul Hootsuite facture chaque utilisateur.
- **L'IA est presque toujours incluse** et présentée comme « illimitée » chez les outils de publication. Quand elle est comptée, c'est en crédits (Later, ContentStudio, Taplio), en tokens (Inoreader) ou en réponses proposées (ReplyGain).
- **Bluesky et Mastodon** ne sont publiés que par Buffer et Typefully (et Metricool pour Bluesky). **Discord et la newsletter** ne sont proposés par aucun.

## Ce que coûte un client à Pann

Quand Pann fournit les services (offres intermédiaire et supérieure). Deux profils :

- **léger** : 1 thème, 2 comptes LinkedIn ou Facebook, environ 600 éléments triés, 200 conversations triées, 40 éléments rédigés, 10 réponses proposées, 8 posts de Création et 30 recherches Exa par mois ;
- **actif** : 3 thèmes, 5 comptes, environ 2 000 éléments triés, 800 conversations, 150 éléments rédigés, 40 réponses, 30 posts de Création et 150 recherches.

Bluesky, Mastodon et Discord sont publiés en direct : ils ne coûtent rien. Seuls LinkedIn et Facebook passent par Zernio.

### Zernio et Exa

- **Zernio** facture chaque compte connecté, sur l'ensemble des clients de Pann : 2 comptes gratuits, puis 6 $ par compte du 3e au 10e, 3 $ du 11e au 100e, 1 $ au-delà. Les posts ne sont pas comptés. Au lancement, chaque compte coûte donc 6 $ ; avec quelques dizaines de clients, 3 $.
- **Exa** : 7 $ les 1 000 recherches, contenu des 10 premiers résultats compris. Moins de 1,10 $ par mois dans les deux profils.

### IA

Estimation tirée de la taille des prompts du code, pas de la consommation réelle : la base de production n'était pas accessible depuis la session. À recaler sur `usage_log` avant de fixer les quotas.

| Opération                                 | Modèle     | Tokens par appel (entrée / sortie)              | Coût par appel |
| ----------------------------------------- | ---------- | ----------------------------------------------- | -------------- |
| Tri d'un élément                          | Haiku 4.5  | 2 500 / 100                                     | 0,0030 $       |
| Tri d'un élément                          | Haiku 5.5  | 3 250 / 130 (tokens comptés 30 % plus nombreux) | 0,0004 $       |
| Tri d'une conversation                    | Haiku 4.5  | 2 000 / 150                                     | 0,0028 $       |
| Rédaction d'un élément                    | Sonnet 5.5 | 4 000 / 1 500                                   | 0,023 $        |
| Réponse proposée                          | Sonnet 5.5 | 2 500 / 400                                     | 0,009 $        |
| Post de Création (recherche et rédaction) | Sonnet 5.5 | 10 000 / 2 500                                  | 0,045 $        |

### Total par mois

| Profil | IA (tri Haiku 4.5) | IA (tri Haiku 5.5) | Zernio (3 $ par compte) | Zernio (6 $ par compte) | Exa    | Total, de… à… |
| ------ | ------------------ | ------------------ | ----------------------- | ----------------------- | ------ | ------------- |
| Léger  | 3,70 $             | 1,70 $             | 6 $                     | 12 $                    | 0,20 $ | **8 à 16 $**  |
| Actif  | 13,40 $            | 6,30 $             | 15 $                    | 30 $                    | 1,05 $ | **22 à 44 $** |

Le paiement en ligne prend en plus environ 1,5 % et 0,25 € par paiement en Europe : un argument pour l'année plutôt que le mois sur les petits montants.

## Ce que ça veut dire pour les offres

1. **Clés personnelles, 2 € par mois, à l'année (24 €).** Moins cher que tout le marché, sans risque : la personne paie ses propres services. Les frais de paiement (environ 0,60 €) n'ont de sens que sur un paiement annuel.
2. **Offre intermédiaire, autour de 19 € par mois (15 € à l'année).** Au niveau de Later Starter, ContentStudio Standard ou Metricool, mais avec la veille et les conversations, qui coûtent ailleurs 30 $ et plus. Couvre le profil léger avec de la marge, à condition de **limiter les comptes LinkedIn et Facebook** (2 ou 3) et de passer le tri sur Haiku 5.5.
3. **Offre supérieure, autour de 49 € par mois (39 € à l'année).** Au niveau de Later Growth, ContentStudio Advanced et Syften Standard. Le profil actif y coûte de 22 à 44 $ : la marge dépend presque entièrement du prix des comptes Zernio. Limiter à 5 ou 6 comptes, et vendre le compte supplémentaire (environ 4 € par mois).
4. **Entreprise : sur devis.** Les offres « équipe » du marché commencent autour de 45 à 300 $.

## Questions à trancher

- **Que compte un « token » ?** Un token de Sonnet coûte 20 fois celui de Haiku 5.5 : additionner les deux donnerait un quota trompeur. Proposition : un token Pann pondéré par le prix du modèle (calé sur la rédaction), affiché aussi en équivalent parlant (« environ 150 éléments rédigés par mois »).
- **Quelles limites par offre ?** Comptes LinkedIn et Facebook (le vrai coût), thèmes, membres de l'espace. Les réseaux publiés en direct (Bluesky, Mastodon, Discord) peuvent rester illimités : ils ne coûtent rien.
- **Un essai gratuit ?** Le marché propose 7 à 14 jours, souvent sans carte. Avec l'IA fournie, il faut un plafond de tokens pendant l'essai.
- **Passer le tri sur Haiku 5.5 ?** Divise le coût de l'IA par deux environ. À valider sur la qualité du tri avant de changer le modèle par défaut.
- **Prix en euros, taxes comprises ou non ?** Le marché affiche des dollars hors taxes ; un public français attend des euros.

## Sources

Pages des éditeurs (lues directement ou par résumé de recherche) : buffer.com/pricing, hootsuite.com/plans, publer.com/plans, later.com/pricing, metricool.com/pricing, contentstudio.io/pricing, typefully.com/pricing, taplio.com/pricing, docs.feedly.com, inoreader.com/pricing, syften.com, octolens.com/pricing, f5bot.com/tiers, brand24.com/prices, replygain.com/pricing, zernio.com/use-cases/saas-platforms, exa.ai/docs/admin/pricing. Prix de Claude : documentation de l'API (Sonnet 5.5 à 2 $ / 10 $, Haiku 5.5 à 0,10 $ / 0,50 $, Haiku 4.5 à 1 $ / 5 $ par million de tokens).

Sites tiers, pour les chiffres marqués : blotato.com, socialync.io, toolradar.com, opentweet.io, justpricing.com, ainfluencer.com, lilachbullock.com, socialrails.com, makerstack.co, hushread.com, dev.to, mintavocado.com, hyperresearch.ai.

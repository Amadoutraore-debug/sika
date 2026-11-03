# Sika — Boutique en ligne & Factures

Plateforme pour vendeurs, PME et freelances en Côte d'Ivoire :

- **Boutique en ligne** : chaque compte crée sa boutique, ajoute ses produits (photo, prix, prix barré, stock) et partage le lien de la boutique ou d'un produit (WhatsApp, Facebook…).
- **Commandes sans compte client** : le client ouvre le lien, remplit son panier et commande avec son nom et son téléphone. Les prix sont vérifiés côté serveur et le stock est décrémenté (puis rendu si la commande est annulée).
- **Commande → facture en un clic** : le vendeur valide la commande, puis génère la facture.
- **Facturation libre** : clients, devis, factures en FCFA (TVA, remise, montant en lettres), paiements (Espèces, Orange Money, MTN MoMo, Moov, Wave, virement), impression PDF, envoi par WhatsApp.

Pages : `index.html` (espace vendeur), `boutique.html?b=<adresse>` (boutique publique, `&p=<id>` pour ouvrir un produit).

Site statique (HTML, CSS, JavaScript), sans étape de compilation.

## Deux modes

| Mode | Quand | Données |
|---|---|---|
| **Local** | `config.js` vide (par défaut) | Dans le navigateur de l'appareil. Sauvegarde/restauration en JSON dans Réglages. |
| **En ligne** | `config.js` rempli avec les clés Supabase | Comptes (e-mail + mot de passe), données synchronisées entre téléphone et ordinateur. |

## Activer les comptes en ligne (Supabase, gratuit)

1. Créer un compte sur <https://supabase.com>, puis **New project** (région : Europe ou la plus proche).
2. **SQL Editor → New query** : coller le contenu de `supabase/schema.sql`, puis **Run**. Recommencer avec `supabase/boutique.sql` (boutiques, produits, commandes, photos).
3. **Authentication → URL Configuration** : mettre l'adresse du site dans **Site URL** (ex. `https://amadoutraore-debug.github.io/sika/`) et l'ajouter aussi dans **Redirect URLs**.
4. **Project Settings → API** : copier **Project URL** et la clé **anon public** dans `config.js`.
5. Publier (`git commit` + `git push`).

Au premier login, les données déjà saisies en mode local sur cet appareil sont reprises dans le compte.

## Tester en local

```bash
python -m http.server 8670
```

Puis ouvrir <http://localhost:8670>.

# Sika — Devis & Factures

Application web de facturation pour PME, startups et freelances en Côte d'Ivoire : clients, devis, factures en FCFA (TVA, remise, montant en lettres), suivi des paiements (Espèces, Orange Money, MTN MoMo, Moov, Wave, virement), impression PDF et envoi par WhatsApp.

Site statique (HTML, CSS, JavaScript), sans étape de compilation.

## Deux modes

| Mode | Quand | Données |
|---|---|---|
| **Local** | `config.js` vide (par défaut) | Dans le navigateur de l'appareil. Sauvegarde/restauration en JSON dans Réglages. |
| **En ligne** | `config.js` rempli avec les clés Supabase | Comptes (e-mail + mot de passe), données synchronisées entre téléphone et ordinateur. |

## Activer les comptes en ligne (Supabase, gratuit)

1. Créer un compte sur <https://supabase.com>, puis **New project** (région : Europe ou la plus proche).
2. **SQL Editor → New query** : coller le contenu de `supabase/schema.sql`, puis **Run**.
3. **Authentication → URL Configuration** : mettre l'adresse du site dans **Site URL** (ex. `https://amadoutraore-debug.github.io/sika/`) et l'ajouter aussi dans **Redirect URLs**.
4. **Project Settings → API** : copier **Project URL** et la clé **anon public** dans `config.js`.
5. Publier (`git commit` + `git push`).

Au premier login, les données déjà saisies en mode local sur cet appareil sont reprises dans le compte.

## Tester en local

```bash
python -m http.server 8670
```

Puis ouvrir <http://localhost:8670>.

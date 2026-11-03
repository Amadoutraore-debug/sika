/*
 * Configuration de Sika.
 * Laisser vide = mode local (données dans le navigateur, sans compte).
 * Renseigner les deux valeurs de votre projet Supabase (Project Settings → API)
 * pour activer les comptes et la synchronisation entre appareils.
 * La clé « anon public » est faite pour être publique : la sécurité vient des règles RLS (supabase/schema.sql).
 */
window.SIKA_CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: ''
};

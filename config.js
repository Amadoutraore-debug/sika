/*
 * Configuration de Sika.
 * Laisser vide = mode local (données dans le navigateur, sans compte).
 * Renseigner les deux valeurs de votre projet Supabase (Project Settings → API)
 * pour activer les comptes et la synchronisation entre appareils.
 * La clé « anon public » est faite pour être publique : la sécurité vient des règles RLS (supabase/schema.sql).
 */
window.SIKA_CONFIG = {
  supabaseUrl: 'https://kbwrrhiopdcnhreiurkz.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtid3JyaGlvcGRjbmhyZWl1cmt6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM2NTM5NzEsImV4cCI6MjEwOTIyOTk3MX0.whHiOpAY7QlMXSPqiZrx8JLg65ukgSpdluJ82UvjoS4'
};

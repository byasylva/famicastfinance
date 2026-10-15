// Configuração do Supabase.
// Pegue os dois valores em: Supabase > Project Settings > API
// A "anon public key" é feita para ficar no navegador — a proteção dos dados
// é feita pelas políticas RLS criadas em supabase/schema.sql.
// NUNCA coloque aqui a chave "service_role".
window.APP_CONFIG = {
  SUPABASE_URL: "https://SEU-PROJETO.supabase.co",
  SUPABASE_ANON_KEY: "SUA-ANON-KEY"
};

# 💰 Finanças da Família

App web de finanças familiares compartilhadas: **HTML/JS puro** (sem build) hospedado no **GitHub Pages**, com **Supabase** (Auth + Postgres + Realtime).

**Recursos:** login por e-mail/senha · família com código de convite · contas · lançamentos (receita/despesa, parcelado, mensal recorrente) · categorias com orçamento mensal · metas de economia · painel com gráficos · filtros e exportação CSV · atualização em tempo real entre os membros · modo claro/escuro · funciona no celular.

## 1. Supabase

1. Crie um projeto em <https://supabase.com>.
2. Abra **SQL Editor → New query**, cole todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e clique **Run**.
3. Em **Project Settings → API**, copie a **Project URL** e a **anon public key**.
4. Em **Authentication → URL Configuration**, defina **Site URL** como a URL do seu GitHub Pages (ex.: `https://SEU-USUARIO.github.io/financas-familia/`). Serve para os links de confirmação de e-mail e de redefinição de senha.
5. (Opcional) Em **Authentication → Providers → Email**, desligue *Confirm email* se quiser entrar logo após criar a conta.

## 2. Configurar o app

Edite `js/config.js`:

```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://xxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJ..."
};
```

> A *anon key* é pública por natureza; quem protege os dados são as políticas **RLS** do `schema.sql`. Nunca use a `service_role` aqui.

## 3. Publicar no GitHub Pages

```bash
git init && git add . && git commit -m "Finanças da Família"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/financas-familia.git
git push -u origin main
```

No repositório: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)`**. Em ~1 minuto o app estará em `https://SEU-USUARIO.github.io/financas-familia/`.

## 4. Usar

1. Crie sua conta → **Criar família** (já vem com categorias padrão e uma conta “Carteira”).
2. Aba **Família** → copie o **código de convite** e envie ao cônjuge/filhos. Eles criam conta e escolhem **Entrar com convite**.
3. Cadastre as contas (aba **Contas**), defina orçamentos (aba **Orçamento**) e lance gastos com o botão **＋**.

## Segurança

- Todas as tabelas têm RLS: só membros da família leem/escrevem os dados dela.
- Contas e categorias de um lançamento precisam ser da mesma família (chaves estrangeiras compostas).
- Criar/entrar em família e gerar código só acontece via funções RPC (`security definer`).
- Todo texto de usuário é escapado no HTML (sem XSS).
- Quem tem o código de convite entra na família — gere um novo em **Família → Novo código** se vazar.

## Estrutura

```
index.html            # shell da página
css/style.css         # estilos (responsivo + modo escuro)
js/config.js          # URL e anon key do Supabase
js/app.js             # toda a lógica do app
supabase/schema.sql   # tabelas, RLS, funções, realtime
```

## Limitações conhecidas

- Um usuário participa de uma única família.
- Não há transferência entre contas nem conciliação de fatura de cartão (cartão é tratado como uma conta com saldo negativo).
- O app carrega todos os lançamentos da família no navegador — ótimo para uso doméstico (dezenas de milhares de linhas), mas não para volumes enormes.

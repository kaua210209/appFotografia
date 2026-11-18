# Estúdio de Fotografia — portfólio + entrega de fotos aos clientes

Aplicação web com **Vite + React (JavaScript) + Tailwind CSS v4 + Supabase**.

- **Área pública:** carrossel, apresentação e serviços, galeria (portfólio), depoimentos, agendamento e contato.
- **Área do cliente** (`/minha-area`): login e senha, eventos contratados, galeria privada, download (foto a foto ou tudo em .zip), novos agendamentos.
- **Painel administrativo** (`/admin`): textos, logotipo, carrossel, galeria pública, clientes (com login/senha), fotos privadas por cliente, liberação de galeria, agendamentos e depoimentos.

## Como a privacidade funciona

- As fotos dos clientes ficam em um bucket **privado** (`private-photos`). Só são exibidas por **links assinados temporários**.
- Regras de segurança (RLS) no banco e no storage garantem que **cada cliente só enxerga as próprias fotos**, e **somente depois que você libera a galeria**.
- Fotos enviadas como privadas **nunca** vão para o portfólio. O botão “Publicar” (no perfil do cliente) cria uma *cópia* no portfólio, e pede confirmação de que o cliente autorizou.
- O cliente vê as fotos com **marca d'água** (cópia reduzida gerada no seu navegador ao enviar). O **arquivo original só é liberado depois que o pagamento é aprovado** — e essa trava está no próprio banco/storage, não apenas na tela.
- O valor cobrado é **calculado no servidor** (função `create-checkout`). O navegador do cliente não consegue alterar preço nem liberar fotos sozinho.

## Passo a passo para colocar no ar

### 1. Criar o projeto no Supabase
1. Crie uma conta e um projeto em <https://supabase.com>.
2. Abra **SQL Editor → New query**, cole todo o conteúdo de `supabase/schema.sql` e clique em **Run**.
   Isso cria tabelas, buckets de arquivos e todas as regras de segurança.

### 2. Desativar cadastro aberto
Em **Authentication → Sign In / Providers**, desative **“Allow new users to sign up”**.
Os clientes são criados somente por você, pelo painel.

### 3. Criar o seu usuário administrador
1. Em **Authentication → Users → Add user**, crie seu usuário (e-mail + senha, marque *Auto Confirm User*).
2. No **SQL Editor**, rode (trocando pelo seu e-mail):
   ```sql
   update public.profiles set role = 'admin' where email = 'seu@email.com';
   ```

### 4. Publicar a função que cria clientes
A criação de logins precisa de uma chave secreta, por isso roda no servidor (Edge Function):
```bash
npm install -g supabase        # ou use: npx supabase ...
supabase login
supabase link --project-ref SEU-PROJECT-REF
supabase functions deploy admin-users
```
(O *project ref* aparece na URL do painel do Supabase.) A função só obedece a usuários com `role = 'admin'`.

### 4B. Ativar os pagamentos (Mercado Pago)
1. No Mercado Pago, abra **Suas integrações → Criar aplicação** (Checkout Pro / pagamentos online) e copie o **Access Token de produção** (`APP_USR-...`).
   Esse token é uma senha: **nunca** o coloque no `.env`, no código do site ou em conversas. Ele fica só nos segredos do Supabase.
2. Guarde os segredos no Supabase:
   ```bash
   supabase secrets set MP_ACCESS_TOKEN=APP_USR-xxxxxxxx SITE_URL=https://seusite.com.br
   ```
3. Publique as duas funções (o webhook precisa ser público, pois o Mercado Pago não envia login):
   ```bash
   supabase functions deploy create-checkout
   supabase functions deploy mp-webhook --no-verify-jwt
   ```
4. (Recomendado) Em **Suas integrações → sua aplicação → Webhooks**, cadastre a URL
   `https://SEU-PROJECT-REF.supabase.co/functions/v1/mp-webhook` com o evento **Pagamentos**, copie a **Assinatura secreta** e salve:
   ```bash
   supabase secrets set MP_WEBHOOK_SECRET=sua-assinatura-secreta
   ```
5. Para testar sem cobrar de verdade, use primeiro as **credenciais de teste** do Mercado Pago no passo 2 e as contas de teste deles; depois troque pelas de produção.

Pix, cartão de crédito e boleto aparecem automaticamente na tela de pagamento do Mercado Pago (conforme o que sua conta tiver habilitado).

**Já usava a versão anterior?** Rode `supabase/schema.sql` de novo no SQL Editor (é seguro repetir): as fotos que já estavam enviadas continuam liberadas, e as novas passam a seguir a regra de venda.

### 5. Configurar e rodar o site
```bash
cp .env.example .env     # preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```
Acesse `http://localhost:5173`, entre em **Área do cliente** com o seu usuário admin e você será levado ao painel.

### 6. Publicar na internet
`npm run build` gera a pasta `dist/`. Hospede em **Vercel**, **Netlify** ou **Cloudflare Pages** (já incluídos `vercel.json` e `public/_redirects` para as rotas funcionarem). Cadastre as duas variáveis `VITE_...` no serviço de hospedagem.
Depois, em **Supabase → Authentication → URL Configuration**, coloque o endereço do site em *Site URL* (necessário para o “Esqueci minha senha”).

## Uso no dia a dia
1. **Painel → Site:** logotipo, textos, contato, serviços. **Portfólio:** carrossel e galeria pública.
2. **Clientes → Novo cliente:** define login e senha (envie ao cliente).
3. No perfil do cliente: **crie o evento**, escolha **como ele compra** (por unidade, com o valor de cada foto; ou álbum, com nº de fotos incluídas, valor do álbum e valor de cada foto a mais) e salve. Depois **envie as fotos**: a marca d'água é aplicada automaticamente (o texto vem de *Painel → Site*). Por fim clique em **Mostrar galeria ao cliente**.
   - *Por unidade:* o cliente seleciona as fotos, vê o total e paga.
   - *Álbum:* o cliente vê quantas fotos tem direito, o valor do álbum e o valor da foto extra; paga o álbum com as fotos que escolher e, se passar da cota, cada extra é somada ao total.
   - Pagamento combinado por fora (dinheiro, Pix direto)? Use **Liberar** na foto ou **Liberar todas** no evento.
   - Pagamentos aparecem na seção **Pagamentos** do perfil do cliente. Se o Mercado Pago confirmar um reembolso ou estorno, as fotos daquele pedido voltam a ficar com marca d'água.
4. **Agendamentos / Depoimentos:** acompanhe as solicitações e aprove os depoimentos antes de aparecerem no site.

## Limites e observações
- Imagens aceitas: JPG, PNG e WEBP, até 50 MB cada (limite do plano gratuito do Supabase). O plano gratuito também tem 1 GB de armazenamento — para muitos eventos, considere um plano pago.
- A marca d'água é gerada no navegador de quem envia as fotos (uma prévia de 1600 px). Envie pelo computador; arquivos muito grandes (acima de ~30 MB) podem ficar lentos. Fotos já liberadas aparecem ao cliente no tamanho original.
- Boleto pode levar até 3 dias úteis para compensar; as fotos são liberadas sozinhas quando o Mercado Pago confirma. O Mercado Pago cobra suas próprias tarifas sobre cada venda.
- Qualquer visitante pode enviar agendamento e depoimento (há um campo-isca anti-robô). Depoimentos só aparecem após a sua aprovação.

## Estrutura
```
supabase/schema.sql                    banco, storage e regras de segurança
supabase/functions/admin-users/        criar cliente, trocar senha, excluir
supabase/functions/create-checkout/    calcula o valor e abre o pagamento no Mercado Pago
supabase/functions/mp-webhook/         recebe a confirmação e libera as fotos originais
src/pages/                             Home, Login, ClientArea, admin/*
src/components/                        Navbar, Lightbox, Uploader, BookingForm, home/*
src/context/                           Auth, Site (conteúdo), Toast
src/lib/                               supabase, storage, constantes
```
Para novas funcionalidades, o caminho é: nova tabela em `schema.sql` (com RLS) + nova página em `src/pages` + rota em `src/App.jsx`.

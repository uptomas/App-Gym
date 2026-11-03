# Ligar o Iron System ao Supabase (amigos, rankings e backup na nuvem)

Sem estes passos a app funciona na mesma, mas só offline. Demora cerca de 10–15 minutos e é tudo grátis.

## 1. Criar o projeto
1. Vai a **https://supabase.com** → *Start your project* → entra com o GitHub.
2. **New project**:
   - Name: `iron-system`
   - Database password: gera uma e guarda-a (não vais precisar dela na app)
   - Region: **West EU (Ireland)** ou **Central EU (Frankfurt)**
3. Espera ~2 minutos até o projeto ficar pronto.

## 2. Criar as tabelas e as regras de segurança
1. Menu da esquerda → **SQL Editor** → **New query**.
2. Copia todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql), cola e carrega em **Run**.
3. Deve aparecer *Success. No rows returned*.

Isto cria:
- `profiles`: username e nome de cada pessoa
- `stats`: o que aparece no ranking (rank, nível, EXP, ranks por músculo, melhores marcas)
- `friendships`: pedidos de amizade e amigos
- `user_data`: backup privado de todos os teus dados (só tu lhe tens acesso)

**Os treinos e o peso corporal nunca ficam visíveis para os outros.**

## 3. Pôr as chaves na app
1. **Project Settings** (roda dentada) → **API**.
2. Copia o **Project URL** e a chave **anon public**.
3. Abre o ficheiro `config.js` e preenche:
   ```js
   window.IRON_CONFIG = {
     supabaseUrl: 'https://xxxxxxxx.supabase.co',
     supabaseAnonKey: 'eyJhbGciOi...',
   };
   ```
   A chave *anon* é pública por natureza (todas as apps Supabase a mostram no navegador). A proteção dos dados é feita pelas regras do passo 2. **Nunca** uses a chave `service_role`.
4. Faz commit e push. Também podes enviar-me os dois valores e eu atualizo o ficheiro.

## 4. Endereço da app (obrigatório para o login funcionar)
**Authentication** → **URL Configuration**:
- **Site URL**: o link da tua app, por exemplo `https://uptomas.github.io/App-Gym/`
- **Redirect URLs** → *Add URL* → o mesmo link

## 5. Login com email
Já vem ativo. Em **Authentication → Providers → Email** podes escolher:
- **Confirm email ligado** (por defeito): cada pessoa recebe um email para confirmar a conta antes de entrar.
- **Confirm email desligado**: os amigos entram logo, sem confirmar. É mais simples para um grupo de amigos.

## 6. Login com Google (opcional)
1. Vai a **https://console.cloud.google.com** → cria um projeto.
2. **APIs & Services → OAuth consent screen** → *External* → preenche o nome da app e o teu email → guarda.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - **Authorized redirect URIs**: `https://xxxxxxxx.supabase.co/auth/v1/callback`. É o teu Project URL seguido de `/auth/v1/callback`; o URL exato aparece no Supabase em *Providers → Google*.
4. Copia o **Client ID** e o **Client secret**.
5. No Supabase: **Authentication → Providers → Google** → ativa → cola os dois valores → **Save**.

> No iPhone, dentro da app instalada no ecrã principal, o login com Google pode abrir o Safari em vez da app. Aí usa email e password.

## 7. Partilhar com os amigos
- Envia-lhes o link da app. Cada pessoa cria a sua conta e escolhe um **username**.
- Em **Profile → Invite friends** (ou **Ranking → Friends → Share invite link**) envias um link que já inclui o teu username. Quem o abrir recebe logo a proposta para te adicionar.
- **Ranking → Friends**: adicionas pessoas pelo `@username`, aceitas pedidos e vês o ranking do grupo.
- **Ranking → Global**: top 100 de todos os jogadores e a tua posição.
- Tocar num jogador mostra o rank, o nível, o mapa muscular e as melhores marcas dele.

## Bom saber
- **Sincronização:** com sessão iniciada, cada alteração é enviada para a nuvem passados ~2 s. Se mudares de telemóvel, entras na conta e os treinos voltam todos.
- **Primeira ligação:** se o telemóvel e a conta tiverem dados diferentes, a app pergunta se queres juntar as duas versões (recomendado), usar a da nuvem ou usar a do dispositivo.
- **Plano grátis do Supabase:** chega para centenas de utilizadores. Se o projeto ficar **7 dias sem qualquer uso**, o Supabase pausa-o; basta abrir o dashboard e carregar em *Restore*.
- **Batotas:** os valores do ranking são calculados no telemóvel de cada pessoa. Para um grupo de amigos chega. Um ranking global "à prova de batota" exigiria validação no servidor.

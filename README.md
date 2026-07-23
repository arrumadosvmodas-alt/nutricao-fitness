# Nutrição & Fitness

Aplicativo de diário alimentar, metas nutricionais e progresso inspirado no funcionamento de produtos como MyFitnessPal, com implementação própria em Supabase, Vercel, Railway e Expo.

## Estrutura

```text
apps/web        Next.js para Vercel
apps/mobile     Expo/React Native para Android, iOS e web mobile
services/api    FastAPI para Railway
supabase         Migrations, seed e configurações locais
docs             Planejamento funcional e técnico
```

## Primeira execução web

1. Copie `.env.example` para `.env.local` e preencha as chaves.
2. Suba o Supabase local ou conecte um projeto hospedado.
3. Instale dependências do frontend e da API.
4. Rode as migrations em `supabase/migrations`.
5. Inicie web e API em terminais separados.

```powershell
cd apps/web
npm install
npm run dev
```

```powershell
cd services/api
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Teste mobile com Expo

1. Confirme o arquivo `apps/mobile/.env` com:

```text
EXPO_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sua-chave-anon
EXPO_PUBLIC_API_URL=https://nutricao-fitnessweb-production.up.railway.app
```

2. Inicie o mobile:

```powershell
npm run dev:mobile
```

3. Para testar no celular:

- instale o app Expo Go;
- leia o QR Code mostrado no terminal;
- mantenha computador e celular na mesma rede Wi-Fi.

4. Para testar no browser do celular:

```powershell
npm run web:mobile
```

A câmera pode ser bloqueada em browser com endereço `http://192...`. Nesse caso, use o campo manual de código de barras ou teste por HTTPS/app instalado.

## Build Android interno

O projeto já possui `apps/mobile/eas.json` para gerar APK de teste interno. Quando for gerar o APK, use dentro de `apps/mobile`:

```powershell
npx eas build -p android --profile preview
```

## Deploy

- Vercel hospeda `apps/web`.
- Railway hospeda `services/api` e workers futuros.
- Supabase fornece Postgres, Auth, Storage, Realtime e RLS.

## Supabase: perfil e metas nutricionais

Para ativar o salvamento do Perfil no Supabase, rode a migration:

```sql
-- arquivo: supabase/migrations/202607230001_nutrition_profiles.sql
```

No painel do Supabase:

1. Abra o projeto.
2. Vá em SQL Editor.
3. Abra o arquivo `supabase/migrations/202607230001_nutrition_profiles.sql` no projeto.
4. Copie todo o conteúdo.
5. Cole no SQL Editor.
6. Clique em Run.
7. Em Table Editor, confirme a tabela `nutrition_profiles`.

Depois disso, no app mobile, entre em Perfil e toque em `Salvar perfil no Supabase`.

## Empacotamento mobile

Assets usados no pacote Expo:

- `apps/mobile/assets/icon.png`: ícone principal.
- `apps/mobile/assets/adaptive-icon.png`: ícone adaptativo Android.
- `apps/mobile/assets/splash.png`: tela de abertura.
- `apps/mobile/assets/logo.png`: logo horizontal para uso interno/marketing.
- `apps/mobile/assets/brand-logo-source.png`: fonte visual do logo.

Checklist antes de gerar APK:

1. Confirmar `apps/mobile/.env` com Supabase e API Railway.
2. Rodar o typecheck:

```powershell
npm --workspace apps/mobile run typecheck
```

3. Entrar no Expo/EAS, se ainda não estiver logado:

```powershell
cd apps/mobile
npx eas login
```

4. Configurar o projeto EAS, se pedir:

```powershell
npx eas build:configure
```

5. Gerar APK Android interno:

```powershell
npm run build:mobile:android
```

O perfil `preview` em `apps/mobile/eas.json` já está configurado para gerar APK.

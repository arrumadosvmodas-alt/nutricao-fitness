# Nutrição & Fitness

Aplicativo de diario alimentar, metas nutricionais e progresso inspirado no funcionamento de produtos como MyFitnessPal, com implementacao propria em Supabase, Vercel e Railway.

## Estrutura

```text
apps/web        Next.js para Vercel
services/api    FastAPI para Railway
supabase         Migrations, seed e configuracoes locais
docs             Planejamento funcional e tecnico
```

## Primeira execucao

1. Copie `.env.example` para `.env.local` e preencha as chaves.
2. Suba o Supabase local ou conecte um projeto hospedado.
3. Instale dependencias do frontend e da API.
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

## Deploy

- Vercel hospeda `apps/web`.
- Railway hospeda `services/api` e workers futuros.
- Supabase fornece Postgres, Auth, Storage, Realtime e RLS.


# Plano do Produto

## Objetivo

Criar um diário nutricional brasileiro, rápido e confiável, com cadastro de alimentos, cálculo de metas, registro diário, água, exercícios, jejum intermitente, peso e progresso.

## Escopo do MVP

- Cadastro e login via Supabase Auth.
- Perfil com altura, peso, idade, sexo, nível de atividade e objetivo.
- Cálculo de BMR, TDEE e metas de calorias/macros.
- Diário por refeição: café da manhã, almoço, jantar e lanches.
- Busca de alimentos e criação de alimentos personalizados.
- Registro de água.
- Registro manual de exercícios.
- Plano de jejum intermitente com protocolos 12:12, 14:10, 16:8 e 18:6.
- Orientação entre a última e a próxima refeição: hidratação, ingestão permitida durante o jejum e faixa sugerida para quebrar o jejum.
- Peso e gráfico simples de progresso.
- Receitas simples com porções.
- Painel admin básico para moderar alimentos.

## Jejum intermitente

O módulo de jejum deve orientar o funcionário sem tratar a orientação como prescrição médica. O usuário escolhe o protocolo, informa horário da última refeição e recebe:

- Horário estimado da próxima refeição.
- Quantidade mínima de água entre refeições, ajustada por peso e contexto.
- Lista do que pode ingerir durante o jejum: água, café sem açúcar, chá sem açúcar e eletrólitos sem calorias quando necessário.
- Faixa de calorias para a próxima refeição, calculada como parte da meta diária.
- Mínimo sugerido de proteína e fibra para quebrar o jejum.
- Avisos de segurança para perfis de risco.

A quebra do jejum deve priorizar proteína, fibra e carboidrato compatível com a meta restante do dia. O app não deve incentivar jejuns extremos, compensação alimentar ou restrição agressiva.

## Fora do MVP

- Foto de refeição.
- Registro por voz.
- Planejador alimentar com IA.
- GLP-1.
- Integrações Garmin, Fitbit, Strava e Apple Watch.
- App mobile nativo.

## Diferencial inicial

O primeiro foco é Brasil: unidades métricas, alimentos nacionais, TACO/TBCA, Open Food Facts e UX em português.

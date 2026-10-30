# Entorno Salvador

Aplicação web de análise territorial para endereços em Salvador. A aplicação geocodifica o endereço, localiza o bairro oficial e calcula indicadores espaciais com dados sincronizados do GeoSalvador e do Fogo Cruzado.

## Arquitetura atual

O projeto não usa MySQL, TiDB, migrações ou banco externo. As fontes são carregadas pelo próprio Web Service e mantidas em cache na memória do processo. O cache é atualizado na inicialização, sob demanda quando uma análise é solicitada e automaticamente a cada 24 horas enquanto o processo estiver ativo.

Como o cache é volátil, ele é perdido quando o Render reinicia ou suspende a instância. Nesse caso, a primeira consulta ou o endpoint de saúde dispara uma nova sincronização. Essa é uma escolha adequada para reduzir complexidade e custo, mas não oferece histórico persistente nem garantia de disponibilidade durante uma atualização.

## O que está integrado

- **Mapa:** Leaflet com tiles OpenStreetMap; não exige chave nem cobrança do Google Maps.
- **Geocodificação:** endpoint backend `/api/geocode`, usando Nominatim com cache de 24 horas e limitação de requisições.
- **Fogo Cruzado:** Playwright/Chromium abre a página oficial, pesquisa Bahia/Salvador e baixa o CSV pelo botão “CSV”.
- **GeoSalvador:** atualização de bairros, escolas e órgãos públicos em GeoJSON.
- **Análise:** violência armada registrada em raio de 500 m nos últimos 24 meses, escolas e órgãos em 800 m e bairro por polígono oficial.
- **Relatos:** mantidos apenas em memória para moderação durante a vida do processo.

## Desenvolvimento local

```bash
pnpm install
pnpm exec playwright install chromium
pnpm check
pnpm test
pnpm build
pnpm dev
```

## Deploy no Render

O `render.yaml` define apenas um Web Service. Ele instala o Chromium, compila e inicia a aplicação. Não há `DATABASE_URL`, `preDeployCommand`, Cron Job separado ou variável do Fogo Cruzado.

As variáveis opcionais de autenticação são `VITE_APP_ID`, `VITE_OAUTH_PORTAL_URL`, `JWT_SECRET`, `OAUTH_SERVER_URL` e `OWNER_OPEN_ID`. O núcleo público de consulta e análise não precisa de banco. `JWT_SECRET` é gerado pelo Blueprint; as demais só devem ser configuradas se o login e a administração forem utilizados.

```bash
git add .
git commit -m "Remove banco e usa cache em memória"
git push origin main
```

## Rotas úteis

- `/api/health/sources` verifica o cache e dispara atualização se necessário.
- `/api/data/fogo-cruzado-salvador-csv` retorna o CSV atual em memória.
- `/api/data/geosalvador-bairros` retorna o GeoJSON atual em memória.

## Custos e limites

A aplicação não utiliza Google Maps e não requer cartão ou chave da Google para o mapa. OpenStreetMap e Nominatim são serviços públicos com políticas de uso e limites; isso não equivale a SLA de produção. O Playwright/Chromium aumenta o tempo e o consumo de memória da atualização inicial.

## Limitações de produto

A análise não classifica uma rua como segura ou perigosa. Fogo Cruzado é uma base colaborativa de violência armada registrada e não representa toda a criminalidade. A ausência de ocorrência não prova ausência de risco. O cache em memória não é adequado para preservar relatos ou dados históricos após reinicializações.

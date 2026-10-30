# Deploy independente: GitHub + Render

## Arquitetura

O projeto pode ser versionado no GitHub e executado em um Web Service Node no Render. O banco continua sendo MySQL/TiDB compatível, porque o Render não oferece MySQL gerenciado nativamente. O `render.yaml` inclui um Web Service e um Cron Job diário para atualizar metadados públicos do GeoSalvador.

## Variáveis necessárias

Configure no Render, nunca no GitHub:

| Variável | Uso |
|---|---|
| `DATABASE_URL` | Conexão MySQL/TiDB do Web Service e do Cron Job |
| `VITE_APP_ID` | Identificador do aplicativo e OAuth |
| `JWT_SECRET` | Assinatura das sessões |
| `OAUTH_SERVER_URL` | Servidor OAuth, normalmente `https://api.manus.im` |
| `OWNER_OPEN_ID` | Identidade administrativa do proprietário |
| `BUILT_IN_FORGE_API_URL` / `BUILT_IN_FORGE_API_KEY` | Recursos server-side do runtime Manus, quando usados |
O Fogo Cruzado não exige variável de API: o Cron Job usa Playwright/Chromium para abrir a página oficial `/search` e baixar o arquivo pelo botão “CSV”.

## Banco e migrações

Depois de criar o banco externo, configure `DATABASE_URL`. O Blueprint agora executa `pnpm db:migrate` no `preDeployCommand` do Web Service:

```bash
pnpm install --frozen-lockfile
pnpm db:migrate
```

A migração atual cria `source_snapshots`, `source_payloads` e `user_reports`. O Cron Job mantém o último payload completo de cada fonte em `source_payloads` e grava um snapshot de cada execução em `source_snapshots`, preservando checksum, volume e data.

## GitHub

1. Crie um repositório vazio, preferencialmente privado durante a fase de integração.
2. Adicione o projeto, excluindo `.env`, tokens, dumps e arquivos de build.
3. Faça push da branch principal.
4. No Render, escolha **New + Blueprint** e aponte para o repositório, usando o `render.yaml`.

## Render

O Web Service executa `pnpm build:render`, aplica as migrações no pre-deploy e inicia com `pnpm start`. O Cron Job instala o Chromium com `pnpm exec playwright install chromium` e executa `pnpm exec tsx server/refresh-sources.ts` diariamente às 03:15 UTC. A frequência pode ser alterada no Blueprint.

O job baixa diariamente os registros completos de Bairros, Escolas e Órgãos públicos do GeoSalvador em GeoJSON. Para o Fogo Cruzado, abre a página `/search` com Chromium, seleciona Bahia, Salvador, o período de 01/01/2020 até a data atual, seleciona “Completo”, executa “Buscar” e aciona o botão oficial “CSV”. O arquivo baixado é armazenado em `source_payloads`.

O CSV atualizado pode ser baixado pelo backend por `/api/data/fogo-cruzado-salvador-csv`, além das rotas equivalentes do GeoSalvador. Cada resposta inclui `X-Source-Fetched-At` e `X-Source-Checksum`.

### Mapa e custos

O frontend usa Leaflet, os tiles públicos do OpenStreetMap e o endpoint Nominatim no backend. Não há chave do Google Maps nem cobrança de Google nesta versão. Isso é apropriado para protótipo e baixo volume, mas os serviços públicos têm política de uso, limites de requisição e não constituem uma garantia comercial de disponibilidade. Antes de uma operação pública com muito tráfego, substitua os tiles por um provedor com SLA ou hospede a própria infraestrutura cartográfica; mantenha cache e não faça geocodificação em massa.

## Diagnóstico no Render

Depois do primeiro Cron Job, consulte `GET /api/health/sources` no domínio do Web Service. O endpoint informa se cada payload está disponível, data, quantidade de registros, checksum e os últimos snapshots de erro. Se `fogo-cruzado-salvador-csv` estiver `missing`, verifique primeiro o log do Cron Job e a instalação do Chromium; se todos estiverem `missing`, verifique `DATABASE_URL` e o `preDeployCommand`.

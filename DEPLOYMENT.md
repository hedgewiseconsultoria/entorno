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
| `FOGO_CRUZADO_API_URL` | Base da API usada pelo exportador oficial; o padrão já está no `render.yaml` |
| `FOGO_CRUZADO_WEB_SECRET` | Opcional: segredo público utilizado pelo JavaScript da página de pesquisa; o código possui fallback para o valor atualmente publicado pela própria página |

As chaves `VITE_*` são embutidas no bundle do navegador; use apenas chaves públicas/restritas por domínio. Não coloque tokens do Fogo Cruzado no frontend.

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

O Web Service executa `pnpm build:render`, aplica as migrações no pre-deploy e inicia com `pnpm start`. O Cron Job executa `pnpm exec tsx server/refresh-sources.ts` diariamente às 03:15 UTC. A frequência pode ser alterada no Blueprint.

O job baixa diariamente os registros completos de Bairros, Escolas e Órgãos públicos do GeoSalvador em GeoJSON. Para o Fogo Cruzado, reproduz o fluxo público da página `/search`: usa o mesmo `x-api-secret` público do frontend oficial, descobre os IDs atuais de Bahia e Salvador, consulta todas as páginas de Salvador e gera no servidor o CSV equivalente ao botão “CSV”. A página não fornece um arquivo CSV estático; ela também monta o arquivo no navegador a partir dessas respostas. Se o Fogo Cruzado alterar a chave pública ou o formato, configure `FOGO_CRUZADO_WEB_SECRET` no Render.

O CSV atualizado pode ser baixado pelo backend por `/api/data/fogo-cruzado-salvador-csv`, além das rotas equivalentes do GeoSalvador. O JSON completo retornado pela API é usado em memória para gerar o CSV e não é duplicado no armazenamento persistente. Cada resposta inclui `X-Source-Fetched-At` e `X-Source-Checksum`.

### Mapa e custos

O frontend usa Leaflet, os tiles públicos do OpenStreetMap e o endpoint Nominatim no backend. Não há chave do Google Maps nem cobrança de Google nesta versão. Isso é apropriado para protótipo e baixo volume, mas os serviços públicos têm política de uso, limites de requisição e não constituem uma garantia comercial de disponibilidade. Antes de uma operação pública com muito tráfego, substitua os tiles por um provedor com SLA ou hospede a própria infraestrutura cartográfica; mantenha cache e não faça geocodificação em massa.

## Diagnóstico no Render

Depois do primeiro Cron Job, consulte `GET /api/health/sources` no domínio do Web Service. O endpoint informa se cada payload está disponível, data, quantidade de registros, checksum e os últimos snapshots de erro. Se `fogo-cruzado-salvador-csv` estiver `missing`, verifique primeiro o log do Cron Job e a variável opcional `FOGO_CRUZADO_WEB_SECRET`; se todos estiverem `missing`, verifique `DATABASE_URL` e o `preDeployCommand`.

# Deploy independente: GitHub + Render

## Arquitetura

O projeto roda em um único Web Service Node no Render e não usa MySQL, TiDB, banco externo ou migrações. O processo mantém as fontes e os relatos em memória. Ao iniciar, ao receber uma análise sem cache ou ao consultar `/api/health/sources`, o servidor atualiza as camadas públicas. Enquanto estiver ativo, renova o cache a cada 24 horas.

O cache é perdido quando o Render reinicia ou suspende a instância. A aplicação foi desenhada para reconstruí-lo automaticamente; portanto, a primeira consulta após uma suspensão pode demorar alguns minutos por causa do download e do Chromium.

## Variáveis do Render

Para o núcleo público, nenhuma variável de banco é necessária. Não cadastre `DATABASE_URL`.

Se o login for utilizado, configure:

- `VITE_APP_ID`: identificador OAuth do aplicativo.
- `VITE_OAUTH_PORTAL_URL`: portal OAuth usado pelo frontend.
- `JWT_SECRET`: pode ser gerada pelo Render via `generateValue: true`.
- `OAUTH_SERVER_URL`: normalmente `https://api.manus.im`.
- `OWNER_OPEN_ID`: identificador do proprietário para recursos administrativos.

`BUILT_IN_FORGE_API_URL` e `BUILT_IN_FORGE_API_KEY` só são necessárias para recursos Manus de IA/notificação que forem efetivamente ativados. O Fogo Cruzado não exige credenciais ou variáveis de API.

## GitHub

1. Envie o conteúdo do projeto para a raiz da branch `main`.
2. Confirme que `render.yaml`, `package.json`, `server/source-refresh.ts` e `server/fogo-page-download.ts` estão na raiz correta.
3. Não envie `.env`, tokens, `node_modules` ou `dist`.
4. No Render, crie ou sincronize um Blueprint usando o repositório.

## Render

O Blueprint define apenas o Web Service `entorno-salvador-web`:

```bash
pnpm install --frozen-lockfile && pnpm exec playwright install chromium && pnpm build:render
```

O comando de inicialização é:

```bash
pnpm start
```

Não deve existir `preDeployCommand`, `DATABASE_URL` ou Cron Job separado nesta arquitetura.

## Atualização das fontes

O servidor busca diariamente, enquanto permanece ativo:

- Bairros do GeoSalvador;
- Escolas do GeoSalvador;
- Órgãos públicos do GeoSalvador;
- CSV oficial do Fogo Cruzado, usando Playwright para abrir `/search`, selecionar Bahia/Salvador, escolher “Completo”, buscar e clicar no botão CSV.

O endpoint `/api/health/sources` mostra o estado atual do cache. Os endpoints `/api/data/:sourceSlug` retornam os payloads disponíveis no processo.

## Diagnóstico

Depois do deploy, abra:

```text
/api/health/sources
```

Se o cache estiver vazio, aguarde a atualização inicial. Verifique os logs do Web Service. Uma atualização bem-sucedida deve indicar `status: "ok"` para as quatro fontes. Se o processo reiniciar, aguarde uma nova sincronização; isso é esperado neste modelo sem persistência.

## Limites

O cache em memória reduz custo e elimina a configuração de banco, mas não preserva histórico de fontes ou relatos. Para operação com alta disponibilidade, múltiplas instâncias, histórico ou moderação persistente, será necessário reintroduzir um armazenamento externo.

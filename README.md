# Entorno Salvador

Aplicação web de análise territorial para endereços em Salvador. A aplicação geocodifica o endereço, localiza o bairro oficial e calcula indicadores espaciais com dados sincronizados do GeoSalvador e do Fogo Cruzado.

## O que está integrado

- **Mapa:** Leaflet com tiles OpenStreetMap; não exige chave nem cobrança do Google Maps.
- **Geocodificação:** endpoint backend `/api/geocode`, usando Nominatim com cache de 24 horas e limitação de requisições.
- **Fogo Cruzado:** atualização diária paginada dos registros de Salvador; geração e armazenamento do CSV completo.
- **GeoSalvador:** atualização diária de bairros, escolas e órgãos públicos em GeoJSON.
- **Análise:** violência armada registrada em raio de 500 m nos últimos 24 meses, escolas e órgãos em 800 m e bairro por polígono oficial.
- **Relatos:** envio para moderação e separação explícita entre relatos comunitários e fontes oficiais.

## Desenvolvimento local

```bash
pnpm install
pnpm check
pnpm test
pnpm build
pnpm dev
```

A aplicação precisa de `DATABASE_URL` para análise real. A sincronização usa a API v2 do Fogo Cruzado com `FOGO_CRUZADO_API_EMAIL` e `FOGO_CRUZADO_API_PASSWORD`, ou um `FOGO_CRUZADO_API_TOKEN` JWT. A API v2 atual não usa o antigo header `x-api-secret`; credenciais e tokens nunca devem ser commitados.

## Deploy no Render

O arquivo `render.yaml` define o Web Service e o Cron Job diário. No Render, configure pelo menos `DATABASE_URL`, `FOGO_CRUZADO_API_EMAIL`/`FOGO_CRUZADO_API_PASSWORD` ou `FOGO_CRUZADO_API_TOKEN`, `VITE_APP_ID`, `OWNER_OPEN_ID`, `BUILT_IN_FORGE_API_URL` e `BUILT_IN_FORGE_API_KEY`, conforme o ambiente de autenticação adotado. O Web Service executa as migrações no pre-deploy. Depois do primeiro Cron Job, consulte `/api/health/sources` para confirmar os payloads.

```bash
git init
git add .
git commit -m "Versão inicial de produção"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git
git push -u origin main
```

## Custos e limites do mapa

A aplicação não utiliza Google Maps e não requer cartão ou chave da Google para o mapa. OpenStreetMap e Nominatim são serviços públicos com políticas de uso e limites; isso não equivale a SLA de produção. Para tráfego alto, substitua os tiles e a geocodificação por um provedor com SLA ou infraestrutura própria, mantendo cache e evitando geocodificação em massa.

O Render, o banco MySQL/TiDB e o Cron Job podem ter custos ou limitações próprias. O plano do Cron Job deve ser verificado no momento da contratação; atualização diária confiável não deve depender de um plano gratuito que suspenda ou limite tarefas agendadas.

## Limitações de produto

A análise não classifica uma rua como segura ou perigosa. Fogo Cruzado é uma base colaborativa de violência armada registrada e não representa toda a criminalidade. A ausência de ocorrência não prova ausência de risco. As camadas de Codesal, SEDUR, PDDU/LOUOS, mobilidade e Transalvador permanecem catalogadas como contextuais até que seus endpoints, licenças e granularidade sejam validados e incorporados ao motor de análise.

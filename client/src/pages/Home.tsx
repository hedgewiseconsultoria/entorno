import { useCallback, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleAlert,
  Database,
  FileText,
  Filter,
  Info,
  Layers3,
  MapPin,
  Menu,
  MessageSquarePlus,
  Minus,
  Navigation,
  Radio,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Waves,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MapView } from "@/components/Map";
import { trpc } from "@/lib/trpc";

const sourceCatalog = [
  {
    name: "Fogo Cruzado",
    category: "Segurança",
    status: "CSV diário armazenado",
    detail: "CSV completo de Salvador, equivalente ao exportador oficial, com checksum e data de coleta.",
    href: "https://api.fogocruzado.org.br/search",
    tone: "coral",
  },
  {
    name: "GeoSalvador · Bairros",
    category: "Território",
    status: "GeoJSON diário armazenado",
    detail: "Limites oficiais baixados em GeoJSON para localização, agregação e comparação territorial.",
    href: "https://geo.salvador.ba.gov.br/arcgis/rest/services/Hosted/Bairros_Feicao/FeatureServer/0?f=pjson",
    tone: "teal",
  },
  {
    name: "GeoSalvador · Escolas",
    category: "Serviços",
    status: "GeoJSON diário armazenado",
    detail: "Pontos oficiais baixados em GeoJSON para distância e quantidade no entorno.",
    href: "https://geo.salvador.ba.gov.br/arcgis/rest/services/Hosted/Escolas_Pontos/FeatureServer/0?f=pjson",
    tone: "teal",
  },
  {
    name: "GeoSalvador · Órgãos públicos",
    category: "Serviços",
    status: "GeoJSON diário armazenado",
    detail: "Equipamentos e órgãos municipais baixados em GeoJSON para consulta espacial.",
    href: "https://geo.salvador.ba.gov.br/arcgis/rest/services/Hosted/ed_gov_mun_2021_p/FeatureServer/0?f=pjson",
    tone: "teal",
  },
  {
    name: "Codesal",
    category: "Risco físico",
    status: "Integração assistida",
    detail: "Áreas de risco geo-hidrológico e histórico de alagamentos/deslizamentos.",
    href: "https://codesal.salvador.ba.gov.br/areas-de-risco/",
    tone: "amber",
  },
  {
    name: "SEDUR · Consulta Prévia",
    category: "Urbanismo",
    status: "Endpoint a confirmar",
    detail: "Zoneamento, uso do solo, regras e transformações possíveis no entorno.",
    href: "https://consultaprevia.sedur.salvador.ba.gov.br",
    tone: "ink",
  },
  {
    name: "PDDU + LOUOS",
    category: "Urbanismo",
    status: "Referência normativa",
    detail: "Plano diretor e legislação de ordenamento do uso e ocupação do solo.",
    href: "https://pddu.salvador.ba.gov.br/",
    tone: "ink",
  },
  {
    name: "ZEIS",
    category: "Urbanismo",
    status: "Uso sujeito a revisão",
    detail: "Camada urbanística especial; não entra no score automático deste MVP.",
    href: "https://www.sefaz.salvador.ba.gov.br/geosalvador/home/item.html?id=e9a46cd6028241b8a79d61116cefac39",
    tone: "ink",
  },
  {
    name: "SEMOB · BRT + metrô",
    category: "Mobilidade",
    status: "Camada contextual",
    detail: "Distância estimada a corredores e estações de transporte.",
    href: "https://mobilidade.salvador.ba.gov.br/",
    tone: "blue",
  },
  {
    name: "Transalvador",
    category: "Mobilidade",
    status: "Relatório contextual",
    detail: "Segurança viária, interdições e contexto de circulação.",
    href: "https://transalvador.salvador.ba.gov.br/",
    tone: "blue",
  },
  {
    name: "Limpurb",
    category: "Serviços",
    status: "Consulta assistida",
    detail: "Programação de coleta por logradouro, sem inferir execução real.",
    href: "https://limpurb.salvador.ba.gov.br/horario-de-coleta/",
    tone: "teal",
  },
  {
    name: "Relatos comunitários",
    category: "Comunidade",
    status: "Estrutura pronta",
    detail: "Ruído, iluminação, água, energia e criminalidade patrimonial relatada.",
    href: "#relatos",
    tone: "purple",
  },
];

const metrics = [
  {
    key: "violence",
    label: "Violência armada registrada",
    value: "Aguardando endereço",
    summary: "Análise calculada após localizar o imóvel",
    period: "Fogo Cruzado · últimos 24 meses",
    icon: ShieldAlert,
    accent: "coral",
    note: "Registro de fonte colaborativa; não representa a totalidade da criminalidade.",
  },
  {
    key: "risk",
    label: "Risco geo-hidrológico",
    value: "Fonte não integrada",
    summary: "Consulte a Codesal antes de decidir",
    period: "Camada contextual · sem score automático",
    icon: Waves,
    accent: "amber",
    note: "Ausência de área mapeada não equivale a garantia de ausência de risco.",
  },
  {
    key: "urban",
    label: "Contexto urbanístico",
    value: "Aguardando endereço",
    summary: "Bairro calculado pelo polígono oficial",
    period: "GeoSalvador · bairros",
    icon: Layers3,
    accent: "ink",
    note: "Mais conveniência e movimento; potencial de ruído e transformação urbana.",
  },
  {
    key: "services",
    label: "Serviços e acessibilidade",
    value: "Aguardando endereço",
    summary: "Escolas e órgãos calculados em 800 m",
    period: "GeoSalvador · consulta atual",
    icon: Navigation,
    accent: "teal",
    note: "A distância não mede frequência, qualidade ou segurança do trajeto.",
  },
];

const categories = ["Todas", "Segurança", "Risco físico", "Urbanismo", "Mobilidade", "Serviços", "Comunidade"];

function SourcePill({ status }: { status: string }) {
  const isReady = status.includes("pública") || status.includes("CSV") || status.includes("GeoJSON") || status.includes("pronta");
  return (
    <span className={`source-pill ${isReady ? "source-pill-ready" : "source-pill-muted"}`}>
      <span className="source-dot" />
      {status}
    </span>
  );
}

function RealMap({ address, onLocationResolved }: { address: string; onLocationResolved: (location: { lat: number; lon: number; displayName: string }) => void }) {
  return <MapView key={address} className="real-map-canvas" address={address} initialCenter={[-13.013, -38.486]} initialZoom={15} onLocationResolved={onLocationResolved} />;
}

export default function Home() {
  const [address, setAddress] = useState("Rua Alagoinhas, 277, Rio Vermelho, Salvador - BA");
  const [searchedAddress, setSearchedAddress] = useState(address);
  const [activeCategory, setActiveCategory] = useState("Todas");
  const [activeMetric, setActiveMetric] = useState("violence");
  const [showSources, setShowSources] = useState(false);
  const [showReportForm, setShowReportForm] = useState(false);
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [reportType, setReportType] = useState("Ruído");
  const [reportText, setReportText] = useState("");
  const [reportError, setReportError] = useState("");
  const [resolvedLocation, setResolvedLocation] = useState<{ lat: number; lon: number; displayName: string } | null>(null);
  const submitReportMutation = trpc.community.submit.useMutation();
  const { data: latestSnapshots = [] } = trpc.sources.latest.useQuery();
  const analysisInput = useMemo(() => ({ latitude: resolvedLocation?.lat ?? -13.013, longitude: resolvedLocation?.lon ?? -38.486, radiusMeters: 500 }), [resolvedLocation]);
  const { data: analysis, isLoading: analysisLoading, error: analysisError } = trpc.analysis.byLocation.useQuery(analysisInput, { enabled: Boolean(resolvedLocation), retry: 1 });
  const onLocationResolved = useCallback((location: { lat: number; lon: number; displayName: string }) => setResolvedLocation(location), []);

  const filteredSources = useMemo(
    () => activeCategory === "Todas" ? sourceCatalog : sourceCatalog.filter((source) => source.category === activeCategory),
    [activeCategory],
  );

  const runSearch = (event: React.FormEvent) => {
    event.preventDefault();
    if (address.trim()) setSearchedAddress(address.trim());
  };

  const submitReport = (event: React.FormEvent) => {
    event.preventDefault();
    setReportError("");
    submitReportMutation.mutate({
      category: reportType === "Ruído" ? "ruido" : reportType === "Iluminação" ? "iluminacao" : reportType === "Falta de água" ? "agua" : reportType === "Falta de energia" ? "energia" : reportType === "Alagamento observado" ? "alagamento" : "patrimonial",
      detail: reportText,
      addressApprox: searchedAddress,
      observedAt: new Date().toISOString(),
    }, {
      onSuccess: () => { setReportSubmitted(true); setReportText(""); },
      onError: () => setReportError("Não foi possível registrar agora. Tente novamente em instantes."),
    });
  };

  const displayedMetrics = useMemo(() => {
    if (!analysis) return metrics;
    return metrics.map((metric) => metric.key === "violence"
      ? { ...metric, value: analysis.violence.recentTwoYears > 0 ? "Registros encontrados" : "Nenhum registro localizado", summary: `${analysis.violence.recentTwoYears} ocorrências em 500 m`, period: "últimos 24 meses · Fogo Cruzado" }
      : metric.key === "services"
        ? { ...metric, value: analysis.services.schoolsWithin800m + analysis.services.publicBodiesWithin800m > 0 ? "Disponibilidade identificada" : "Poucos equipamentos", summary: `${analysis.services.schoolsWithin800m} escolas · ${analysis.services.publicBodiesWithin800m} órgãos em 800 m`, period: "GeoSalvador · consulta atual" }
        : metric.key === "urban"
          ? { ...metric, value: analysis.neighborhood, summary: "Bairro identificado por polígono oficial", period: "GeoSalvador · bairros" }
          : metric);
  }, [analysis]);
  const selectedMetric = displayedMetrics.find((metric) => metric.key === activeMetric) ?? displayedMetrics[0];

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f7f5f0] text-[#102a43]">
      <header className="site-header">
        <div className="brand-lockup">
          <div className="brand-mark"><span /></div>
          <div>
            <div className="brand-name">entorno<span>salvador</span></div>
            <div className="brand-subtitle">inteligência territorial independente</div>
          </div>
        </div>
        <nav className="desktop-nav" aria-label="Navegação principal">
          <a href="#analise" className="nav-link nav-link-active">Analisar endereço</a>
          <a href="#camadas" className="nav-link">Camadas</a>
          <a href="#metodo" className="nav-link">Como funciona</a>
        </nav>
        <div className="header-actions">
          <span className="live-status"><span /> dados públicos atualizados</span>
          <button className="mobile-menu" aria-label="Abrir menu"><Menu size={20} /></button>
        </div>
      </header>

      <section className="hero-shell" id="analise">
        <div className="hero-copy">
          <div className="eyebrow"><Sparkles size={14} /> DECISÕES DE MORADIA, COM CONTEXTO</div>
          <h1>Antes de fechar o contrato,<br /><em>entenda o entorno.</em></h1>
          <p className="hero-intro">Uma leitura independente do endereço para quem quer alugar ou comprar em Salvador — sem rótulos absolutos, com fontes e limitações à vista.</p>
          <form className="search-box" onSubmit={runSearch}>
            <MapPin size={20} className="search-icon" />
            <Input aria-label="Endereço do imóvel" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Digite o endereço do imóvel" />
            <Button type="submit" className="search-button"><Search size={17} /> Analisar</Button>
          </form>
          <div className="search-hint"><Info size={14} /> O endereço será geocodificado e os indicadores serão calculados com as fontes sincronizadas.</div>
        </div>
        <div className="hero-art" aria-label="Mapa ilustrativo de Salvador">
          <div className="art-label art-label-top">RIO VERMELHO <span>•</span> SALVADOR</div>
          <div className="map-orbit orbit-one" /><div className="map-orbit orbit-two" />
          <div className="street street-a" /><div className="street street-b" /><div className="street street-c" /><div className="street street-d" />
          <div className="neighborhood n-one">AMARALINA</div><div className="neighborhood n-two">FEDERAÇÃO</div><div className="neighborhood n-three">ONDINA</div>
          <div className="map-pin"><div className="pin-core"><MapPin size={23} /></div><span>seu endereço</span></div>
          <div className="art-card"><span className="mini-kicker">PERFIL DO ENTORNO</span><strong>4 dimensões</strong><small>evidência · contexto · fontes</small></div>
          <div className="north">N <div className="north-arrow" /></div>
        </div>
      </section>

      <section className="report-section" aria-labelledby="report-title">
        <div className="report-header">
          <div>
            <div className="section-kicker">RELATÓRIO DE CONTEXTO</div>
            <h2 id="report-title">{searchedAddress}</h2>
            <p className="report-meta"><span className="green-dot" /> Análise por endereço · raio principal de 500 m · dados com data e checksum de atualização</p>
          </div>
          <div className="report-actions"><Button variant="outline" className="outline-button" onClick={() => setShowSources(!showSources)}><Database size={16} /> Fontes usadas</Button><Button className="dark-button"><FileText size={16} /> Exportar PDF</Button></div>
        </div>

        {showSources && <div className="source-drawer"><div><strong>Transparência primeiro.</strong><span> O MVP separa fonte, período, unidade territorial e limitações de cada indicador. {latestSnapshots.length > 0 ? `${latestSnapshots.length} sincronizações registradas no banco.` : "A sincronização diária ainda não foi executada."}</span></div><button onClick={() => setShowSources(false)} aria-label="Fechar"><X size={18} /></button></div>}

        <div className="dimension-grid">
          {displayedMetrics.map((metric) => {
            const Icon = metric.icon;
            const isActive = activeMetric === metric.key;
            return <button key={metric.key} className={`dimension-card ${isActive ? "dimension-active" : ""} accent-${metric.accent}`} onClick={() => setActiveMetric(metric.key)}>
              <div className="dimension-top"><span className="dimension-icon"><Icon size={18} /></span><span className="dimension-arrow">↗</span></div>
              <div className="dimension-label">{metric.label}</div>
              <div className="dimension-value">{metric.value}</div>
              <div className="dimension-summary">{metric.summary}</div>
              <div className="dimension-period">{metric.period}</div>
            </button>;
          })}
        </div>

        <div className="analysis-grid">
          <Card className="map-card-large">
            <CardHeader className="card-heading-row"><div><div className="section-kicker">LEITURA ESPACIAL</div><CardTitle>O que existe ao redor</CardTitle></div><Badge className="soft-badge"><Radio size={13} /> Dados agregados</Badge></CardHeader>
            <CardContent>
              <div className="analysis-map"><RealMap address={searchedAddress} onLocationResolved={onLocationResolved} /></div>
              {analysisLoading && <div className="map-footnote"><Info size={14} /> Endereço localizado; calculando indicadores com as fontes sincronizadas…</div>}
              {analysisError && <div className="map-footnote"><Info size={14} /> O mapa foi localizado, mas a análise de fontes ainda não está disponível.</div>}
              <div className="map-footnote"><Info size={14} /> Mapa base OpenStreetMap e geocodificação via Nominatim. Pontos de ocorrência não são exibidos individualmente.</div>
            </CardContent>
          </Card>

          <Card className="detail-card">
            <CardHeader><div className="section-kicker">DIMENSÃO SELECIONADA</div><CardTitle>{selectedMetric.label}</CardTitle></CardHeader>
            <CardContent>
              <div className={`detail-status status-${selectedMetric.accent}`}><span className="status-icon">{selectedMetric.key === "risk" ? <Check size={17} /> : selectedMetric.key === "violence" ? <CircleAlert size={17} /> : <Minus size={17} />}</span>{selectedMetric.value}</div>
              <p className="detail-copy">{selectedMetric.note}</p>
              <div className="detail-stat"><strong>{selectedMetric.summary}</strong><span>{selectedMetric.period}</span></div>
              <div className="detail-list">
                <div><span>Unidade espacial</span><strong>raio de 500 m</strong></div>
                <div><span>Fonte primária</span><strong>{selectedMetric.key === "violence" ? "Fogo Cruzado" : selectedMetric.key === "risk" ? "Codesal" : selectedMetric.key === "urban" ? "SEDUR / PDDU" : "GeoSalvador"}</strong></div>
                <div><span>Confiança</span><strong>{selectedMetric.key === "violence" ? "média" : "média-alta"}</strong></div>
              </div>
              <button className="text-link">Como chegamos aqui? <ArrowUpRight size={15} /></button>
            </CardContent>
          </Card>
        </div>

        <div className="insight-strip"><div className="insight-icon"><Info size={19} /></div><div><strong>Leia o conjunto, não uma nota única.</strong><p>Boa mobilidade não neutraliza uma área de risco. Ausência de registros não garante segurança. O relatório foi desenhado para mostrar trade-offs.</p></div><button className="text-link">Ver metodologia <ArrowUpRight size={15} /></button></div>
      </section>

      <section className="layers-section" id="camadas">
        <div className="section-kicker">INVENTÁRIO DE DADOS</div>
        <div className="layers-header"><div><h2>Fontes que alimentam a leitura</h2><p>Um mapa de proveniência para você saber o que está integrado, o que é contextual e o que ainda depende de validação.</p></div><div className="layers-counter"><strong>{sourceCatalog.length}</strong><span>fontes mapeadas</span></div></div>
        <div className="category-bar"><SlidersHorizontal size={16} /> {categories.map((category) => <button key={category} className={activeCategory === category ? "category-active" : ""} onClick={() => setActiveCategory(category)}>{category}</button>)}</div>
        <div className="source-grid">{filteredSources.map((source) => <a className={`source-card tone-${source.tone}`} href={source.href} target={source.href.startsWith("#") ? undefined : "_blank"} rel="noreferrer" key={source.name}>
          <div className="source-card-top"><span className="source-category">{source.category}</span><ArrowUpRight size={16} /></div><h3>{source.name}</h3><p>{source.detail}</p><SourcePill status={source.status} />
        </a>)}</div>
      </section>

      <section className="community-section" id="relatos">
        <div className="community-copy"><div className="section-kicker">CAMADA COMUNITÁRIA</div><h2>O que a base oficial não conta?</h2><p>O MVP já nasce preparado para receber relatos sobre ruído, iluminação, água, energia, alagamentos observados e criminalidade patrimonial percebida — sempre separados das fontes oficiais.</p><div className="community-tags"><span>ruído</span><span>iluminação</span><span>água & energia</span><span>ocorrências patrimoniais</span></div></div>
        <Card className="report-card"><CardHeader><div className="report-card-icon"><MessageSquarePlus size={19} /></div><div><CardTitle>Contribuir com um relato</CardTitle><p>Estrutura de coleta do MVP</p></div></CardHeader><CardContent>{!showReportForm && !reportSubmitted && <><p className="report-card-text">Relatos entram em uma fila de moderação, são agregados por período e localização aproximada, e nunca substituem registros oficiais.</p><Button className="coral-button" onClick={() => setShowReportForm(true)}>Adicionar relato <ArrowUpRight size={16} /></Button></>}{showReportForm && !reportSubmitted && <form className="report-form" onSubmit={submitReport}><div><Label htmlFor="report-type">Tema</Label><select id="report-type" value={reportType} onChange={(event) => setReportType(event.target.value)}><option>Ruído</option><option>Iluminação</option><option>Falta de água</option><option>Falta de energia</option><option>Alagamento observado</option><option>Ocorrência patrimonial</option></select></div><div><Label htmlFor="report-text">Relato breve</Label><Textarea id="report-text" required value={reportText} onChange={(event) => setReportText(event.target.value)} placeholder="O que foi observado? Em qual período?" /></div><div className="form-actions"><button type="button" className="cancel-button" onClick={() => setShowReportForm(false)}>Cancelar</button><Button type="submit" disabled={submitReportMutation.isPending} className="coral-button">{submitReportMutation.isPending ? "Enviando…" : "Enviar para moderação"}</Button></div>{reportError && <div className="form-error">{reportError}</div>}<small>Não inclua nomes, documentos, placas ou acusações contra pessoas.</small></form>}{reportSubmitted && <div className="success-state"><div className="success-check"><Check size={20} /></div><strong>Relato recebido para moderação.</strong><p>No produto final, ele será analisado antes de aparecer como sinal comunitário agregado.</p><button className="text-link" onClick={() => { setReportSubmitted(false); setShowReportForm(false); }}>Voltar</button></div>}</CardContent></Card>
      </section>

      <section className="method-section" id="metodo"><div className="method-number">04</div><div><div className="section-kicker">MÉTODO E LIMITES</div><h2>Transparência é uma funcionalidade.</h2><p>O produto não classifica ruas como seguras ou perigosas. Ele apresenta dimensões independentes, com período, raio, fonte, qualidade e limitações. A camada de relatos comunitários mantém sua própria confiança e moderação.</p><div className="method-columns"><div><strong>Não fazemos</strong><span>nota única de segurança</span><span>pontos individuais de ocorrência</span><span>promessa de ausência de risco</span></div><div><strong>Entregamos</strong><span>evidências por dimensão</span><span>fontes auditáveis</span><span>contexto para decidir melhor</span></div></div></div></section>

      <footer className="site-footer"><div className="brand-name">entorno<span>salvador</span></div><p>Relatórios independentes de contexto urbano para Salvador.</p><div className="footer-right"><span>Dados públicos + sinais comunitários</span><span>Versão produção inicial · setembro 2026</span></div></footer>
    </main>
  );
}

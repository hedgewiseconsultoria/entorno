import { useMemo, useRef, useState } from "react";
import { Download, Share2, ShieldAlert, Sparkles, Users, Navigation as NavigationIcon } from "lucide-react";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from "recharts";
import { Button } from "@/components/ui/button";

export type AnalysisResult = {
  mode: "morar" | "visitar";
  point: { lat: number; lon: number };
  radiusMeters: number;
  windowLabel: string;
  neighborhood: string;
  violence: { total: number; recentWindow: number };
  services: { schoolsWithin800m: number; publicBodiesWithin800m: number };
  community: { reportsNearby: number; windowDays: number };
};

interface ShareCardProps {
  address: string;
  analysis: AnalysisResult;
}

const MODE_LABEL: Record<AnalysisResult["mode"], string> = { morar: "MODO MORAR", visitar: "MODO VISITAR" };
const MODE_TITLE: Record<AnalysisResult["mode"], string> = { morar: "Panorama para morar", visitar: "Panorama para visitar" };

function clampPercent(value: number, softCap: number) {
  return Math.max(4, Math.min(100, Math.round((value / softCap) * 100)));
}

export function ShareCard({ address, analysis }: ShareCardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [shareState, setShareState] = useState<"idle" | "copied" | "shared" | "error">("idle");

  const servicesTotal = analysis.services.schoolsWithin800m + analysis.services.publicBodiesWithin800m;

  const radarData = useMemo(() => ([
    { subject: "Violência registrada", value: clampPercent(analysis.violence.recentWindow, 10), raw: analysis.violence.recentWindow },
    { subject: "Serviços próximos", value: clampPercent(servicesTotal, 16), raw: servicesTotal },
    { subject: "Relatos comunitários", value: clampPercent(analysis.community.reportsNearby, 8), raw: analysis.community.reportsNearby },
  ]), [analysis, servicesTotal]);

  const stamp = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

  function drawCard(): HTMLCanvasElement {
    const canvas = canvasRef.current ?? document.createElement("canvas");
    canvasRef.current = canvas;
    const width = 1080;
    const height = 1350;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;

    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#102a43");
    gradient.addColorStop(1, "#1b4566");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "rgba(255,255,255,.08)";
    ctx.beginPath();
    ctx.arc(width - 120, 160, 260, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#f17d60";
    ctx.font = "600 22px 'DM Mono', monospace";
    ctx.fillText(MODE_LABEL[analysis.mode], 64, 96);

    ctx.fillStyle = "#fffdf9";
    ctx.font = "600 52px 'Playfair Display', serif";
    wrapText(ctx, MODE_TITLE[analysis.mode], 64, 170, width - 128, 58);

    ctx.font = "13px 'DM Mono', monospace";
    ctx.fillStyle = "rgba(255,253,249,.72)";
    wrapText(ctx, address, 64, 250, width - 128, 22);

    ctx.font = "13px 'DM Mono', monospace";
    ctx.fillStyle = "rgba(255,253,249,.55)";
    ctx.fillText(`Bairro identificado: ${analysis.neighborhood}  ·  raio de ${analysis.radiusMeters} m`, 64, 300);

    const cards = [
      { label: "VIOLÊNCIA ARMADA REGISTRADA", value: String(analysis.violence.recentWindow), unit: analysis.windowLabel, accent: "#f17d60" },
      { label: "ESCOLAS + ÓRGÃOS EM 800 M", value: String(servicesTotal), unit: "GeoSalvador", accent: "#5fa7a1" },
      { label: "RELATOS COMUNITÁRIOS PRÓXIMOS", value: String(analysis.community.reportsNearby), unit: `últimos ${analysis.community.windowDays} dias`, accent: "#dfae55" },
    ];

    let y = 380;
    for (const item of cards) {
      ctx.fillStyle = "rgba(255,253,249,.07)";
      roundRect(ctx, 64, y, width - 128, 150, 14);
      ctx.fill();
      ctx.fillStyle = item.accent;
      roundRect(ctx, 64, y, 8, 150, 4);
      ctx.fill();

      ctx.fillStyle = "rgba(255,253,249,.6)";
      ctx.font = "13px 'DM Mono', monospace";
      ctx.fillText(item.label, 100, y + 42);

      ctx.fillStyle = "#fffdf9";
      ctx.font = "600 58px 'Playfair Display', serif";
      ctx.fillText(item.value, 100, y + 108);

      ctx.fillStyle = "rgba(255,253,249,.55)";
      ctx.font = "13px 'DM Mono', monospace";
      ctx.fillText(item.unit, 260, y + 108);

      y += 174;
    }

    ctx.fillStyle = "rgba(255,253,249,.5)";
    ctx.font = "12px 'DM Mono', monospace";
    wrapText(ctx, "Leitura de contexto com fontes públicas — não é uma nota de segurança nem substitui julgamento no local.", 64, y + 30, width - 128, 20);
    ctx.fillText(`entorno salvador · gerado em ${stamp}`, 64, height - 48);

    return canvas;
  }

  async function handleDownload() {
    const canvas = drawCard();
    const url = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = url;
    link.download = `entorno-salvador-${analysis.mode}.png`;
    link.click();
  }

  async function handleShare() {
    setShareState("idle");
    const canvas = drawCard();
    try {
      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      const shareText = `${MODE_TITLE[analysis.mode]} · ${address} — via entorno salvador`;
      if (blob && navigator.canShare && navigator.canShare({ files: [new File([blob], "entorno-salvador.png", { type: "image/png" })] })) {
        await navigator.share({
          title: "entorno salvador",
          text: shareText,
          files: [new File([blob], "entorno-salvador.png", { type: "image/png" })],
        });
        setShareState("shared");
        return;
      }
      if (navigator.share) {
        await navigator.share({ title: "entorno salvador", text: shareText });
        setShareState("shared");
        return;
      }
      await navigator.clipboard.writeText(shareText);
      setShareState("copied");
    } catch {
      setShareState("error");
    }
  }

  return (
    <div className="share-card">
      <div className="share-card-preview">
        <div className="share-card-badge"><Sparkles size={13} /> {MODE_LABEL[analysis.mode]}</div>
        <h3>{MODE_TITLE[analysis.mode]}</h3>
        <p className="share-card-address">{address}</p>
        <div className="share-card-chart">
          <ResponsiveContainer width="100%" height={220}>
            <RadarChart data={radarData} outerRadius="72%">
              <PolarGrid stroke="rgba(16,42,67,.15)" />
              <PolarAngleAxis dataKey="subject" tick={{ fill: "#425b6a", fontSize: 11 }} />
              <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 100]} />
              <Radar dataKey="value" stroke="#f17d60" fill="#f17d60" fillOpacity={0.35} />
            </RadarChart>
          </ResponsiveContainer>
          <span className="share-card-chart-note">Comparativo de sinais coletados na área — não é uma nota de segurança.</span>
        </div>
        <div className="share-card-stats">
          <div><ShieldAlert size={15} /><strong>{analysis.violence.recentWindow}</strong><span>violência · {analysis.windowLabel}</span></div>
          <div><NavigationIcon size={15} /><strong>{servicesTotal}</strong><span>escolas + órgãos · 800 m</span></div>
          <div><Users size={15} /><strong>{analysis.community.reportsNearby}</strong><span>relatos · {analysis.community.windowDays} dias</span></div>
        </div>
      </div>
      <div className="share-card-actions">
        <Button variant="outline" className="outline-button" onClick={handleDownload}><Download size={16} /> Baixar imagem</Button>
        <Button className="coral-button" onClick={handleShare}><Share2 size={16} /> Compartilhar resultado</Button>
      </div>
      {shareState === "copied" && <p className="share-card-feedback">Resumo copiado — cole onde quiser compartilhar.</p>}
      {shareState === "shared" && <p className="share-card-feedback">Compartilhado com sucesso.</p>}
      {shareState === "error" && <p className="share-card-feedback share-card-feedback-error">Não foi possível compartilhar agora. Tente baixar a imagem.</p>}
      <canvas ref={canvasRef} style={{ display: "none" }} />
    </div>
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(" ");
  let line = "";
  let cursorY = y;
  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, x, cursorY);
      line = word;
      cursorY += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line) ctx.fillText(line, x, cursorY);
}

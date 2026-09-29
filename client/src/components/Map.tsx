import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { cn } from "@/lib/utils";

interface MapViewProps {
  className?: string;
  address?: string;
  initialCenter?: L.LatLngExpression;
  initialZoom?: number;
  onLocationResolved?: (location: { lat: number; lon: number; displayName: string }) => void;
}

type GeocodeResult = { lat: string; lon: string; display_name: string };

export function MapView({
  className,
  address,
  initialCenter = [-12.9714, -38.5014],
  initialZoom = 13,
  onLocationResolved,
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    const map = L.map(mapContainer.current, { zoomControl: true, attributionControl: true }).setView(initialCenter, initialZoom);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    }).addTo(map);
    mapRef.current = map;
    const resize = () => map.invalidateSize();
    window.setTimeout(resize, 0);
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      map.remove();
      mapRef.current = null;
    };
  }, [initialCenter, initialZoom]);

  useEffect(() => {
    if (!address?.trim() || !mapRef.current) return;
    const controller = new AbortController();
    setStatus("loading");
    fetch(`/api/geocode?q=${encodeURIComponent(address)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("geocode-failed");
        return response.json() as Promise<{ result?: GeocodeResult }>;
      })
      .then(({ result }) => {
        if (!result || !mapRef.current) throw new Error("address-not-found");
        const position: L.LatLngExpression = [Number(result.lat), Number(result.lon)];
        mapRef.current.setView(position, 16, { animate: true });
        markerRef.current?.remove();
        markerRef.current = L.circleMarker(position, {
          radius: 10,
          color: "#f07f68",
          weight: 4,
          fillColor: "#fffaf5",
          fillOpacity: 1,
        }).addTo(mapRef.current).bindTooltip(result.display_name, { direction: "top", offset: [0, -8] }).openTooltip();
        onLocationResolved?.({ lat: Number(result.lat), lon: Number(result.lon), displayName: result.display_name });
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if ((error as Error)?.name !== "AbortError") setStatus("error");
      });
    return () => controller.abort();
  }, [address, onLocationResolved]);

  return (
    <div className={cn("relative h-[500px] w-full overflow-hidden", className)}>
      <div ref={mapContainer} className="h-full w-full" />
      <div className="pointer-events-none absolute left-3 top-3 z-[400] rounded-full bg-white/90 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-600 shadow-sm">
        {status === "loading" ? "Localizando endereço…" : status === "error" ? "Endereço não localizado" : "OpenStreetMap · Salvador"}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";

export type MaleCNSPoint = {
  index: number;
  body_id: number;
  coordinate: [number, number, number];
  activation: number;
  magnitude: number;
  active: boolean;
  roles: string[];
};

export type MaleCNSFrame = {
  kind?: "anatomy" | "activity";
  step: number;
  total_steps: number;
  sampled: true;
  total_neurons: number;
  coordinate_count: number;
  bounds?: [[number, number, number], [number, number, number]];
  points: MaleCNSPoint[];
};

function drawMap(canvas: HTMLCanvasElement | null, frame: MaleCNSFrame, selectedIndex: number, miniature = false) {
  if (!canvas || typeof CanvasRenderingContext2D === "undefined") return;
  const context = canvas.getContext("2d");
  if (!context) return;
  const scale = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight);
  const pixelWidth = Math.round(width * scale), pixelHeight = Math.round(height * scale);
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.clearRect(0, 0, width, height);
  const fallbackMin: [number, number, number] = [2468, 4758, 10154];
  const fallbackMax: [number, number, number] = [93668, 68996, 134531];
  const [minimum, maximum] = frame.bounds ?? [fallbackMin, fallbackMax];
  const pad = miniature ? 1 : 16;
  const locate = (point: MaleCNSPoint) => ({
    x: pad + ((point.coordinate[0] - minimum[0]) / Math.max(1, maximum[0] - minimum[0])) * (width - pad * 2),
    y: pad + ((point.coordinate[2] - minimum[2]) / Math.max(1, maximum[2] - minimum[2])) * (height - pad * 2),
  });
  for (const point of frame.points.filter(point => !point.active)) {
    const position = locate(point);
    context.fillStyle = miniature ? "rgba(218,190,143,.22)" : "rgba(75,59,43,.18)";
    context.fillRect(position.x, position.y, miniature ? 0.7 : 1.2, miniature ? 0.7 : 1.2);
  }
  const peak = Math.max(1e-8, ...frame.points.map(point => point.magnitude));
  for (const point of frame.points.filter(point => point.active)) {
    const position = locate(point), intensity = Math.sqrt(point.magnitude / peak);
    context.beginPath();
    context.arc(position.x, position.y, (miniature ? 0.8 : 1.9) + intensity * (miniature ? 1.3 : 3.6), 0, Math.PI * 2);
    context.fillStyle = point.activation < 0 ? `rgba(68,79,58,${0.35 + intensity * 0.65})` : `rgba(126,48,40,${0.35 + intensity * 0.65})`;
    context.fill();
    if (!miniature && point.index === selectedIndex) {
      context.strokeStyle = "#f2d9aa"; context.lineWidth = 1.5; context.stroke();
    }
  }
}

export function MaleCNSMap({ frame, active }: { frame: MaleCNSFrame; active: boolean }) {
  const mapRef = useRef<HTMLCanvasElement>(null), bodyRef = useRef<HTMLCanvasElement>(null);
  const activePoints = useMemo(() => frame.points.filter(point => point.active), [frame]);
  const [selectedIndex, setSelectedIndex] = useState(activePoints[0]?.index ?? frame.points[0]?.index ?? -1);
  const selected = frame.points.find(point => point.index === selectedIndex) ?? activePoints[0] ?? frame.points[0];

  useEffect(() => {
    if (!frame.points.some(point => point.index === selectedIndex)) setSelectedIndex(activePoints[0]?.index ?? frame.points[0]?.index ?? -1);
  }, [activePoints, frame, selectedIndex]);
  useEffect(() => {
    const render = () => { drawMap(mapRef.current, frame, selectedIndex); drawMap(bodyRef.current, frame, selectedIndex, true); };
    render(); window.addEventListener("resize", render);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(render);
    if (mapRef.current) observer?.observe(mapRef.current);
    if (bodyRef.current) observer?.observe(bodyRef.current);
    return () => { observer?.disconnect(); window.removeEventListener("resize", render); };
  }, [frame, selectedIndex]);

  const chooseNearest = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const [minimum, maximum] = frame.bounds ?? [[2468, 4758, 10154], [93668, 68996, 134531]];
    const pad = 16;
    let nearest = frame.points[0], distance = Infinity;
    for (const point of frame.points) {
      const x = pad + ((point.coordinate[0] - minimum[0]) / Math.max(1, maximum[0] - minimum[0])) * (rect.width - pad * 2);
      const y = pad + ((point.coordinate[2] - minimum[2]) / Math.max(1, maximum[2] - minimum[2])) * (rect.height - pad * 2);
      const candidate = (x - (event.clientX - rect.left)) ** 2 + (y - (event.clientY - rect.top)) ** 2;
      if (candidate < distance) { nearest = point; distance = candidate; }
    }
    if (nearest) setSelectedIndex(nearest.index);
  };

  return <div className={`lf-neural-map ${active ? "is-live" : "is-settled"}`}>
    <div className="lf-fly-specimen">
      <Image src="/art/legalfly/fly-counsel.webp" width={1000} height={667} alt="The fruit-fly counsel, shown with its sampled MaleCNS activity across the body" />
      <canvas ref={bodyRef} className="lf-body-map" aria-hidden="true" />
      <span>Same worker frame projected over counsel&apos;s body</span>
    </div>
    <div className="lf-anatomy-sheet">
      <div className="lf-map-heading"><span>MaleCNS soma map</span><strong>{frame.kind === "anatomy" ? "released anatomy · idle" : `update ${frame.step}/${frame.total_steps}`}</strong></div>
      <canvas ref={mapRef} onPointerDown={chooseNearest} role="img" aria-label="Actual sampled MaleCNS activity mapped to released soma coordinates" />
      <div className="lf-map-key"><span><i className="positive" />positive activation</span><span><i className="negative" />negative activation</span><span><i className="context" />mapped context</span></div>
    </div>
    <div className="lf-neuron-record" aria-live="polite">
      <label>Inspect displayed neuron<select aria-label="Inspect displayed neuron" value={selected?.index ?? ""} onChange={event => setSelectedIndex(Number(event.target.value))}>{frame.points.map(point => <option key={point.index} value={point.index}>Body {point.body_id}</option>)}</select></label>
      {selected ? <><strong>Body {selected.body_id}</strong><span>activation {selected.activation >= 0 ? "+" : ""}{selected.activation.toFixed(5)}</span><span>source soma coordinate {selected.coordinate.join(", ")}</span><span>{selected.roles.length ? selected.roles.map(role => role === "vnc" ? "VNC" : role).join(" · ") : "retained traced neuron"}</span></> : null}
    </div>
    <p className="lf-map-disclosure">{frame.points.length.toLocaleString()} displayed from {frame.total_neurons.toLocaleString()} retained neurons. {frame.coordinate_count.toLocaleString()} mapped coordinates are available. Bright points are the strongest coordinate-mapped activations in this worker frame. The body overlay repeats the x/z projection and is not anatomical registration. The computation still uses the full graph.</p>
  </div>;
}

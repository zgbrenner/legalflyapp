"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Simulation } from "@/lib/api";
import * as THREE from "three";

type Props = {
  simulation?: Simulation | null;
  playing?: boolean;
  className?: string;
  title?: string;
  heightClass?: string;
};

const REGION_HUE: Record<string, number> = {
  mushroom_body: 0.08,
  central_complex: 0.95,
  antennal_lobe_like: 0.55,
  optic_lobe_like: 0.42,
  descending: 0.02,
  central_brain: 0.12,
};

function regionHue(region: string, fallbackIndex: number) {
  if (REGION_HUE[region] != null) return REGION_HUE[region];
  return (fallbackIndex * 0.11) % 1;
}

/** Soft display boost so sparse reservoir states still read as firing. */
function displayIntensity(raw: number) {
  return Math.min(1, Math.pow(Math.max(0, raw), 0.72) * 1.35);
}

function SynapseLines({
  positions,
  edges,
  activity,
  pulse,
}: {
  positions: number[][];
  edges: number[][];
  activity: number[];
  pulse: number;
}) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const pos: number[] = [];
    const cols: number[] = [];
    for (const edge of edges) {
      const [a, b, w] = edge;
      if (a >= positions.length || b >= positions.length) continue;
      const ia = displayIntensity(activity[a] ?? 0);
      const ib = displayIntensity(activity[b] ?? 0);
      const strength = Math.min(1, (ia + ib) * 0.6 + w * 0.18);
      if (strength < 0.06) continue;
      const pa = positions[a];
      const pb = positions[b];
      pos.push(pa[0], pa[1], pa[2], pb[0], pb[1], pb[2]);
      const glow = 0.18 + strength * (0.5 + 0.32 * Math.sin(pulse * 5 + a * 0.19));
      const color = new THREE.Color().setHSL(0.04 + strength * 0.1, 0.9, glow);
      cols.push(color.r, color.g, color.b, color.r, color.g, color.b);
    }
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    return geo;
  }, [positions, edges, activity, pulse]);

  if ((geometry.getAttribute("position")?.count ?? 0) === 0) return null;

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial vertexColors transparent opacity={0.62} depthWrite={false} />
    </lineSegments>
  );
}

/** Bright packets racing along active synapses — the “brain lighting up” cue. */
function SynapticSparks({
  positions,
  edges,
  activity,
  pulse,
}: {
  positions: number[][];
  edges: number[][];
  activity: number[];
  pulse: number;
}) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const pos: number[] = [];
    const cols: number[] = [];
    const sizes: number[] = [];
    let sparkIndex = 0;
    for (const edge of edges) {
      const [a, b, w] = edge;
      if (a >= positions.length || b >= positions.length) continue;
      const ia = displayIntensity(activity[a] ?? 0);
      const ib = displayIntensity(activity[b] ?? 0);
      const strength = Math.min(1, (ia + ib) * 0.65 + w * 0.2);
      if (strength < 0.22) continue;
      const pa = positions[a];
      const pb = positions[b];
      const t = (Math.sin(pulse * 2.8 + sparkIndex * 0.37) + 1) * 0.5;
      const x = pa[0] + (pb[0] - pa[0]) * t;
      const y = pa[1] + (pb[1] - pa[1]) * t;
      const z = pa[2] + (pb[2] - pa[2]) * t;
      pos.push(x, y, z);
      const color = new THREE.Color().setHSL(0.08 + strength * 0.06, 1, 0.55 + strength * 0.35);
      cols.push(color.r, color.g, color.b);
      sizes.push(0.06 + strength * 0.16);
      sparkIndex += 1;
      if (sparkIndex > 220) break;
    }
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    geo.setAttribute("size", new THREE.Float32BufferAttribute(sizes, 1));
    return geo;
  }, [positions, edges, activity, pulse]);

  if ((geometry.getAttribute("position")?.count ?? 0) === 0) return null;

  return (
    <points geometry={geometry}>
      <pointsMaterial
        vertexColors
        size={0.18}
        sizeAttenuation
        transparent
        opacity={0.95}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function ActivityPoints({
  positions,
  activity,
  regions,
  inputLocal,
  pulse,
}: {
  positions: number[][];
  activity: number[];
  regions: string[];
  inputLocal: number[];
  pulse: number;
}) {
  const uniqueRegions = useMemo(() => Array.from(new Set(regions)), [regions]);
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(positions.length * 3);
    const colors = new Float32Array(positions.length * 3);
    const sizes = new Float32Array(positions.length);
    const inputSet = new Set(inputLocal);
    for (let i = 0; i < positions.length; i++) {
      pos[i * 3] = positions[i][0];
      pos[i * 3 + 1] = positions[i][1];
      pos[i * 3 + 2] = positions[i][2];
      const intensity = displayIntensity(activity[i] ?? 0);
      const beat = 0.82 + 0.18 * Math.sin(pulse * 6 + i * 0.21);
      const isInput = inputSet.has(i);
      const hue = isInput ? 0.11 : regionHue(regions[i], uniqueRegions.indexOf(regions[i]));
      const color = new THREE.Color().setHSL(
        hue,
        isInput ? 0.95 : 0.72,
        0.18 + intensity * 0.62 * beat,
      );
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
      sizes[i] = (isInput ? 0.16 : 0.09) + intensity * 0.34 * beat;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
    return geo;
  }, [positions, activity, regions, inputLocal, pulse, uniqueRegions]);

  return (
    <points geometry={geometry}>
      <pointsMaterial
        vertexColors
        size={0.22}
        sizeAttenuation
        transparent
        opacity={0.96}
        depthWrite={false}
      />
    </points>
  );
}

function GlowHalos({
  positions,
  activity,
  pulse,
}: {
  positions: number[][];
  activity: number[];
  pulse: number;
}) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const pos: number[] = [];
    const cols: number[] = [];
    for (let i = 0; i < positions.length; i++) {
      const intensity = displayIntensity(activity[i] ?? 0);
      if (intensity < 0.28) continue;
      const beat = 0.9 + 0.1 * Math.sin(pulse * 4 + i);
      pos.push(positions[i][0], positions[i][1], positions[i][2]);
      const color = new THREE.Color().setHSL(0.06, 0.95, 0.35 + intensity * 0.45 * beat);
      cols.push(color.r, color.g, color.b);
    }
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    return geo;
  }, [positions, activity, pulse]);

  if ((geometry.getAttribute("position")?.count ?? 0) === 0) return null;

  return (
    <points geometry={geometry}>
      <pointsMaterial
        vertexColors
        size={0.55}
        sizeAttenuation
        transparent
        opacity={0.35}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function SceneContent({
  positions,
  activity,
  regions,
  edges,
  inputLocal,
  playing,
}: {
  positions: number[][];
  activity: number[];
  regions: string[];
  edges: number[][];
  inputLocal: number[];
  playing: boolean;
}) {
  const [pulse, setPulse] = useState(0);
  const lightRef = useRef<THREE.PointLight>(null);
  const mean = useMemo(() => {
    if (!activity.length) return 0;
    let s = 0;
    for (const v of activity) s += displayIntensity(v);
    return s / activity.length;
  }, [activity]);

  useFrame((_, delta) => {
    if (!playing) return;
    setPulse((p) => p + delta);
    if (lightRef.current) {
      lightRef.current.intensity = 0.85 + mean * 2.4 + Math.sin(pulse * 3) * 0.2;
    }
  });

  return (
    <>
      <color attach="background" args={["#070a09"]} />
      <fog attach="fog" args={["#070a09", 10, 26]} />
      <ambientLight intensity={0.35 + mean * 0.4} />
      <pointLight ref={lightRef} position={[3.5, 5.5, 7]} intensity={1.2} color="#ff9a6b" />
      <pointLight position={[-5, -1.5, -3]} intensity={0.35 + mean * 0.5} color="#6ec8b8" />
      <pointLight position={[0, 2, -6]} intensity={0.25 + mean * 0.8} color="#ff4d2e" />
      <SynapseLines positions={positions} edges={edges} activity={activity} pulse={pulse} />
      <SynapticSparks positions={positions} edges={edges} activity={activity} pulse={pulse} />
      <GlowHalos positions={positions} activity={activity} pulse={pulse} />
      <ActivityPoints
        positions={positions}
        activity={activity}
        regions={regions}
        inputLocal={inputLocal}
        pulse={pulse}
      />
      <OrbitControls enablePan enableZoom enableRotate autoRotate={playing} autoRotateSpeed={0.55} />
    </>
  );
}

export function ConnectomeViz({
  simulation,
  playing = true,
  className = "",
  title = "Tissue activation",
  heightClass = "h-80 md:h-[28rem]",
}: Props) {
  const trajectory = simulation?.trajectory ?? [];
  const positions = simulation?.positions ?? [];
  const regions = simulation?.regions ?? [];
  const edges = simulation?.edges ?? [];
  const inputLocal = simulation?.input_indices_local ?? [];
  const [frame, setFrame] = useState(0);
  const [paused, setPaused] = useState(!playing);

  useEffect(() => {
    setFrame(0);
    setPaused(!playing);
  }, [simulation, playing]);

  useEffect(() => {
    if (paused || trajectory.length === 0) return;
    const id = window.setInterval(() => {
      setFrame((f) => (f + 1) % trajectory.length);
    }, 48);
    return () => window.clearInterval(id);
  }, [paused, trajectory.length]);

  const activity =
    trajectory.length > 0
      ? trajectory[Math.min(frame, trajectory.length - 1)]
      : (simulation?.final_activity ?? []);

  const hasData = positions.length > 0 && activity.length > 0;
  const regionBars = Object.entries(simulation?.aggregate?.region_activity ?? {}).sort(
    (a, b) => Number(b[1]) - Number(a[1]),
  );
  const maxRegion = Math.max(0.001, ...regionBars.map(([, v]) => Number(v)));
  const meanFire =
    activity.length > 0
      ? activity.reduce((s, v) => s + displayIntensity(v), 0) / activity.length
      : 0;

  return (
    <div className={`overflow-hidden border border-ink/15 bg-[#070a09] text-paper ${className}`}>
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#f0a07a]">{title}</p>
          <p className="text-xs text-white/65">
            {simulation?.anatomical
              ? "Real hemibrain edges · watch synapses flash as the tissue fires"
              : "Synthetic modular corpse · abstract layout — not a waking fly"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden font-mono text-[10px] uppercase tracking-wider text-[#f0a07a]/40 sm:inline">
            fire {(meanFire * 100).toFixed(0)}%
          </span>
          <button
            type="button"
            className="border border-white/20 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-white/80 hover:border-[#f0a07a] hover:text-[#f0a07a]"
            onClick={() => setPaused((p) => !p)}
          >
            {paused ? "Play" : "Pause"}
          </button>
          <button
            type="button"
            className="border border-white/20 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-white/80"
            onClick={() => setFrame(0)}
          >
            Reset
          </button>
        </div>
      </div>

      <div className={`relative w-full ${heightClass}`}>
        {hasData ? (
          <Canvas camera={{ position: [0, 1.4, 11], fov: 40 }} dpr={[1, 1.75]}>
            <SceneContent
              positions={positions}
              activity={activity}
              regions={regions}
              edges={edges}
              inputLocal={inputLocal}
              playing={!paused}
            />
          </Canvas>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-white/50">
            Stimulate the connectome to watch activity bloom
          </div>
        )}
        {regionBars.length > 0 ? (
          <div className="pointer-events-none absolute bottom-3 left-3 right-3 grid gap-1.5 sm:max-w-sm">
            {regionBars.slice(0, 6).map(([name, value]) => (
              <div key={name} className="rounded bg-black/55 px-2 py-1 backdrop-blur-sm">
                <div className="mb-1 flex justify-between font-mono text-[9px] uppercase tracking-wider text-white/75">
                  <span>{name.replaceAll("_", " ")}</span>
                  <span>{(Number(value) * 100).toFixed(0)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-sm bg-white/10">
                  <div
                    className="h-full bg-gradient-to-r from-[#8c1212] via-[#e85a2a] to-[#ffd0a8] transition-[width] duration-150"
                    style={{ width: `${(Number(value) / maxRegion) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {trajectory.length > 0 ? (
        <div className="border-t border-white/10 px-3 py-2">
          <label className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-wider text-white/60">
            Activation wave
            <input
              type="range"
              min={0}
              max={Math.max(0, trajectory.length - 1)}
              value={frame}
              onChange={(e) => {
                setPaused(true);
                setFrame(Number(e.target.value));
              }}
              className="w-full accent-[#c45c26]"
            />
            <span>
              {frame + 1}/{trajectory.length}
            </span>
          </label>
        </div>
      ) : null}
    </div>
  );
}

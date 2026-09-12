"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Simulation } from "@/lib/api";
import * as THREE from "three";

type Props = {
  simulation?: Simulation | null;
  playing?: boolean;
  className?: string;
  title?: string;
};

function ActivityPoints({
  positions,
  activity,
  regions,
}: {
  positions: number[][];
  activity: number[];
  regions: string[];
}) {
  const ref = useRef<THREE.Points>(null);
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(positions.length * 3);
    const colors = new Float32Array(positions.length * 3);
    const sizes = new Float32Array(positions.length);
    const regionHue: Record<string, number> = {};
    let hue = 0.05;
    for (const region of Array.from(new Set(regions))) {
      regionHue[region] = hue;
      hue += 0.11;
    }
    for (let i = 0; i < positions.length; i++) {
      pos[i * 3] = positions[i][0];
      pos[i * 3 + 1] = positions[i][1];
      pos[i * 3 + 2] = positions[i][2];
      const intensity = Math.min(1, activity[i] ?? 0);
      const color = new THREE.Color().setHSL(
        regionHue[regions[i]] ?? 0.08,
        0.65,
        0.25 + intensity * 0.45,
      );
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
      sizes[i] = 0.08 + intensity * 0.22;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
    return geo;
  }, [positions, activity, regions]);

  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial
        vertexColors
        size={0.18}
        sizeAttenuation
        transparent
        opacity={0.92}
        depthWrite={false}
      />
    </points>
  );
}

export function ConnectomeViz({
  simulation,
  playing = true,
  className = "",
  title = "Reservoir activity",
}: Props) {
  const trajectory = simulation?.trajectory ?? [];
  const positions = simulation?.positions ?? [];
  const regions = simulation?.regions ?? [];
  const [frame, setFrame] = useState(0);
  const [paused, setPaused] = useState(!playing);

  useEffect(() => {
    setFrame(0);
  }, [simulation]);

  useEffect(() => {
    if (paused || trajectory.length === 0) return;
    const id = window.setInterval(() => {
      setFrame((f) => (f + 1) % trajectory.length);
    }, 90);
    return () => window.clearInterval(id);
  }, [paused, trajectory.length]);

  const activity =
    trajectory.length > 0
      ? trajectory[Math.min(frame, trajectory.length - 1)]
      : simulation?.final_activity ?? [];

  const hasData = positions.length > 0 && activity.length > 0;

  return (
    <div className={`overflow-hidden border border-ink/15 bg-[#11140f] text-paper ${className}`}>
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/55">{title}</p>
          <p className="text-xs text-white/70">
            {simulation?.anatomical
              ? "Anatomical coordinates"
              : "Abstract region-cluster layout — not fly anatomy"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="border border-white/20 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-white/80"
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
      <div className="relative h-72 w-full md:h-80">
        {hasData ? (
          <Canvas camera={{ position: [0, 0, 9], fov: 45 }}>
            <color attach="background" args={["#11140f"]} />
            <ambientLight intensity={0.7} />
            <ActivityPoints positions={positions} activity={activity} regions={regions} />
            <OrbitControls enablePan enableZoom enableRotate />
          </Canvas>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-white/50">
            Stimulate the connectome to visualize activity
          </div>
        )}
      </div>
      {trajectory.length > 0 ? (
        <div className="border-t border-white/10 px-3 py-2">
          <label className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-wider text-white/60">
            Timestep
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
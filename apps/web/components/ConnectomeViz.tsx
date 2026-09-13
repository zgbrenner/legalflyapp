"use client";
import { Canvas, useFrame } from "@react-three/fiber";
import { Component, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import * as THREE from "three";
import type { Simulation } from "@/lib/api";
import { displayActivity, schematicPosition } from "@/lib/brain-layout";
export type PlaybackClock = { time: number; paused: boolean };
type Props = { simulation?: Simulation | null; playing?: boolean; className?: string; title?: string; heightClass?: string; clock?: MutableRefObject<PlaybackClock>; angle?: number; reducedMotion?: boolean };
const VERTEX = `attribute float glow; varying float vGlow; uniform float uSize;
void main(){vGlow=glow;vec4 p=modelViewMatrix*vec4(position,1.0);gl_PointSize=uSize*(.5+glow*1.6)*(8.0/-p.z);gl_Position=projectionMatrix*p;}`;
const FRAGMENT = `precision mediump float; varying float vGlow; uniform float uBase;
void main(){float d=length(gl_PointCoord-vec2(.5));if(d>.5)discard;
float a=exp(-d*d*16.0)*(uBase+vGlow*.82);vec3 c=mix(vec3(.37,.62,.46),vec3(.94,1.,.72),vGlow);
gl_FragColor=vec4(c,a);}`;
function pointMaterial(size: number, base: number) {
  return new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader: FRAGMENT, uniforms: { uSize: { value: size }, uBase: { value: base } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
}
function Scene({ simulation, clock, angle, onSelect }: { simulation: Simulation; clock: MutableRefObject<PlaybackClock>; angle: number; onSelect: (i: number) => void }) {
  const ids = simulation.node_ids ?? (simulation.indices ?? []).map(String);
  const positions = useMemo(() => ids.map(schematicPosition), [simulation]); // eslint-disable-line react-hooks/exhaustive-deps
  const edges = useMemo(() => (simulation.edges ?? []).filter(([a,b]) => a < positions.length && b < positions.length), [simulation, positions]);
  const group = useRef<THREE.Group>(null);
  const objects = useMemo(() => {
    const points = new THREE.BufferGeometry();
    points.setAttribute("position", new THREE.Float32BufferAttribute(positions.flat(), 3));
    points.setAttribute("glow", new THREE.BufferAttribute(new Float32Array(positions.length), 1));
    const lines = new THREE.BufferGeometry();
    lines.setAttribute("position", new THREE.Float32BufferAttribute(edges.flatMap(([a,b]) => [...positions[a], ...positions[b]]), 3));
    lines.setAttribute("color", new THREE.BufferAttribute(new Float32Array(edges.length*6), 3));
    const sparks = new THREE.BufferGeometry();
    const count = Math.min(100, edges.length);
    sparks.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count*3), 3));
    sparks.setAttribute("glow", new THREE.BufferAttribute(new Float32Array(count), 1));
    return { points, lines, sparks, pointMat: pointMaterial(6, .17), sparkMat: pointMaterial(9, 0), count };
  }, [positions, edges]);
  useEffect(() => () => { objects.points.dispose(); objects.lines.dispose(); objects.sparks.dispose(); objects.pointMat.dispose(); objects.sparkMat.dispose(); }, [objects]);
  useFrame(() => {
    const time = clock.current.time;
    const frames = simulation.trajectory ?? [];
    const t = frames.length ? (time / .5) % frames.length : 0;
    const a = frames[Math.floor(t)] ?? simulation.final_activity ?? [];
    const b = frames[(Math.floor(t)+1)%Math.max(1,frames.length)] ?? a;
    const mix = t - Math.floor(t);
    const intensity = (i: number) => displayActivity((a[i] ?? 0)*(1-mix) + (b[i] ?? 0)*mix);
    const glow = objects.points.getAttribute("glow") as THREE.BufferAttribute;
    for (let i=0;i<positions.length;i++) glow.setX(i, intensity(i));
    glow.needsUpdate = true;
    const colors = objects.lines.getAttribute("color") as THREE.BufferAttribute;
    edges.forEach(([src,dst],i) => { const strength = Math.max(intensity(src), intensity(dst)); const v = .055 + strength*.25; colors.setXYZ(i*2, v*.62, v, v*.7); colors.setXYZ(i*2+1, v*.62, v, v*.7); });
    colors.needsUpdate = true;
    const sparkPosition = objects.sparks.getAttribute("position") as THREE.BufferAttribute;
    const sparkGlow = objects.sparks.getAttribute("glow") as THREE.BufferAttribute;
    for (let i=0;i<objects.count;i++) {
      const [src,dst] = edges[i]; const progress = (time/3 + i*.137)%1;
      sparkPosition.setXYZ(i, ...positions[src].map((v,j) => v + (positions[dst][j]-v)*progress) as [number,number,number]);
      sparkGlow.setX(i, intensity(src) > .12 ? intensity(src)*.8 : 0);
    }
    sparkPosition.needsUpdate = true; sparkGlow.needsUpdate = true;
    if (group.current) group.current.rotation.y = angle;
  });
  return <group ref={group} rotation={[.08,angle,0]}>
    {[-1,1].map(side => <mesh key={side} position={[side*.95,.15,0]} scale={[1.39,.98,.69]} rotation={[0,0,side*-.06]}><sphereGeometry args={[1,32,18]}/><meshBasicMaterial color="#81ab80" wireframe transparent opacity={.045}/></mesh>)}
    <lineSegments geometry={objects.lines}><lineBasicMaterial vertexColors transparent opacity={.7} depthWrite={false}/></lineSegments>
    <points geometry={objects.points} material={objects.pointMat} onClick={event => { event.stopPropagation(); if (event.index != null) onSelect(event.index); }}/>
    <points geometry={objects.sparks} material={objects.sparkMat}/>
  </group>;
}
function FlatBrain({ simulation }: { simulation: Simulation }) {
  const ids = simulation.node_ids ?? (simulation.indices ?? []).map(String);
  const positions = ids.map(schematicPosition);
  return <svg viewBox="0 0 500 300" role="img" aria-label="Two-dimensional view of measured final neuron activity" style={{ width:"100%",height:"100%" }}>
    {(simulation.edges ?? []).slice(0,500).map(([a,b],i) => positions[a] && positions[b] ? <line key={i} x1={250+positions[a][0]*90} y1={150-positions[a][1]*90} x2={250+positions[b][0]*90} y2={150-positions[b][1]*90} stroke="#7bab79" strokeOpacity=".12"/> : null)}
    {positions.map((p,i) => <circle key={ids[i]} cx={250+p[0]*90} cy={150-p[1]*90} r={1.3+displayActivity(simulation.final_activity?.[i] ?? 0)*2.7} fill="#c4e5a5" opacity={.25+displayActivity(simulation.final_activity?.[i] ?? 0)*.75}/>)}
  </svg>;
}
class SceneBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
export function ConnectomeViz({ simulation, playing = true, className = "", title = "Fly wiring", clock, angle = 0, reducedMotion = false }: Props) {
  const ownClock = useRef<PlaybackClock>({ time:0,paused:!playing });
  const activeClock = clock ?? ownClock;
  const [webgl,setWebgl] = useState(false),[flat,setFlat] = useState(false),[selected,setSelected] = useState(0);
  useEffect(() => { try { const canvas=document.createElement("canvas"); const context=canvas.getContext("webgl2"); setWebgl(Boolean(context)); context?.getExtension("WEBGL_lose_context")?.loseContext(); } catch { setWebgl(false); } }, []);
  useEffect(() => { setSelected(0); }, [simulation]);
  useEffect(() => {
    if (clock || !playing || reducedMotion) return;
    let frame=0,last=performance.now();
    const tick=(now:number)=>{ if (!document.hidden) ownClock.current.time+=(now-last)/1000; last=now; frame=requestAnimationFrame(tick); };
    frame=requestAnimationFrame(tick); return()=>cancelAnimationFrame(frame);
  }, [clock,playing,reducedMotion]);
  const ids=simulation?.node_ids ?? (simulation?.indices ?? []).map(String);
  const hasData=ids.length>0 && Boolean(simulation?.final_activity?.length);
  const id = Math.min(selected,Math.max(0,ids.length-1));
  const mode2d = flat || !webgl;
  return <div className={`brain-viz ${className}`}><div className="brain-canvas">
    {hasData && simulation ? <SceneBoundary fallback={<FlatBrain simulation={simulation}/>}>{mode2d ? <FlatBrain simulation={simulation}/> :
      <Canvas frameloop={playing ? "always" : "demand"} camera={{ position:[0,.15,6.9],fov:40 }} dpr={[1,1.5]} gl={{ antialias:true,alpha:true }} raycaster={{ params:{ Mesh:{}, Line:{threshold:1}, LOD:{}, Sprite:{}, Points:{ threshold:.07 } } }} aria-label={`${title}: measured neuron activity in an illustrative brain-shaped layout`}><Scene simulation={simulation} clock={activeClock} angle={angle} onSelect={setSelected}/></Canvas>}</SceneBoundary> : <div className="brain-empty">Run a passage to inspect the neural response.</div>}
    <div className="brain-hud">{hasData ? <>{ids.length} NEURONS DISPLAYED<br/>{(simulation?.edges?.length ?? 0).toLocaleString()} CONNECTIONS DISPLAYED<br/>SCHEMATIC, NOT MICROSCOPY</> : "NO ACTIVITY LOADED"}</div>
    <div className="brain-scale">{mode2d ? "2D / FINAL STATE" : "ACTIVITY ×18"}</div></div>
    {hasData ? <div className="neuron-inspector"><label htmlFor={`neuron-${title.replaceAll(" ","-")}`}>Inspect neuron</label><select id={`neuron-${title.replaceAll(" ","-")}`} value={id} onChange={e=>setSelected(Number(e.target.value))}>{ids.map((node,i)=><option key={`${node}-${i}`} value={i}>{node}</option>)}</select><span>{simulation?.regions?.[id]?.replaceAll("_"," ")}</span><span className="neuron-degree">{simulation?.in_degrees?.[id] ?? "?"} in / {simulation?.out_degrees?.[id] ?? "?"} out · final {(simulation?.final_activity?.[id] ?? 0).toFixed(4)}</span>{webgl ? <button type="button" onClick={()=>setFlat(v=>!v)} style={{ marginLeft:"auto",fontSize:10,textDecoration:"underline" }}>{flat ? "3D view" : "2D view"}</button> : null}</div> : null}
  </div>;
}

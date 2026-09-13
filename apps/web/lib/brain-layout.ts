/** Illustrative insect-brain staging, not measured EM coordinates. */
export function schematicPosition(id: string): [number, number, number] {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const next = () => { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return h / 4294967296; };
  const side = next() > .5 ? 1 : -1;
  const theta = next() * Math.PI * 2;
  const z = next() * 2 - 1;
  const radius = Math.cbrt(next());
  const radial = Math.sqrt(1 - z*z) * radius;
  return [side * .95 + Math.cos(theta)*radial*1.32, .15 + Math.sin(theta)*radial*.93, z*radius*.64];
}
export function displayActivity(value: number): number {
  // Identical fixed gain for every model and passage, never outcome-dependent.
  return Math.min(1, Math.max(0, value) * 18);
}

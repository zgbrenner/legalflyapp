import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

type Asset = { file?: unknown; neurons?: unknown; connections?: unknown };
type Manifest = { available?: unknown; graph?: Asset; anatomy?: Asset; shuffled?: Asset };

const response = (ready: boolean) => Response.json(
  { status: ready ? "ok" : "unavailable", service: "legalfly-web" },
  { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } },
);

const integer = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;

export function createHealthResponse(root = join(process.cwd(), "public", "legalfly")) {
  try {
    const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8")) as Manifest;
    if (manifest.available !== true || !manifest.graph || !manifest.anatomy || !manifest.shuffled) return response(false);
    const { graph, anatomy, shuffled } = manifest;
    if (!integer(graph.neurons) || !integer(graph.connections) || anatomy.neurons !== graph.neurons) return response(false);
    if (shuffled.neurons !== graph.neurons || shuffled.connections !== graph.connections) return response(false);

    const graphBytes = 16 + (graph.neurons + 1) * 4 + graph.connections * 8;
    const anatomyBytes = 16 + graph.neurons * 17;
    const required = [
      [graph.file, "malecns.bin", graphBytes],
      [anatomy.file, "malecns-anatomy.bin", anatomyBytes],
      [shuffled.file, "malecns-shuffled.bin", graphBytes],
    ] as const;
    const ready = required.every(([file, expectedName, bytes]) => (
      file === expectedName && statSync(join(root, expectedName)).size === bytes
    ));
    return response(ready);
  } catch {
    return response(false);
  }
}

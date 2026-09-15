export type MiniMindAssetMetadata = {
  revision: string;
  quantization: "q8";
  files: number;
  bytes: number;
};

export function verifyMiniMindAssets(root: string): MiniMindAssetMetadata;
export function requiresFullAssets(environment?: Record<string, string | undefined>): boolean;

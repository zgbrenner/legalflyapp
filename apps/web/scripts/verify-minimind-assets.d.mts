export type MiniMindAssetMetadata = {
  revision: string;
  quantization: "q8";
  files: number;
  bytes: number;
  exact: boolean;
};

export type MiniMindAssetOptions = {
  /** Fail when the directory holds anything beyond manifest.json and the five verified artifacts. */
  exact?: boolean;
};

export function verifyMiniMindAssets(root: string, options?: MiniMindAssetOptions): MiniMindAssetMetadata;
export function requiresFullAssets(environment?: Record<string, string | undefined>): boolean;

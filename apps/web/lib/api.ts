export type Simulation = {
  indices?: number[];
  node_ids?: string[];
  in_degrees?: number[];
  out_degrees?: number[];
  total_neurons?: number;
  total_edges?: number;
  graph_hash?: string;
  positions?: number[][];
  regions?: string[];
  final_activity?: number[];
  trajectory?: number[][];
  edges?: number[][];
  input_indices_local?: number[];
  aggregate?: {
    mean_abs?: number;
    max_abs?: number;
    input_mean_abs?: number;
    region_activity?: Record<string, number>;
  };
  timesteps?: number;
  layout?: string;
  anatomical?: boolean;
  sampled_activity?: unknown[];
};

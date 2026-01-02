

export type InteractionTopology = 'spatial' | 'global';
export type SeedingMode = 'random' | 'balanced';

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface SimulationConfig {
  gridWidth: number;
  gridHeight: number;
  tapeSize: number; // usually 64
  mutationRate: number; // Probability per byte per epoch (Paper default: 0.024% = 0.00024)
  instructionLimit: number; // "Metabolic limit" (Paper default: 8192)
  topology: InteractionTopology; // 'spatial' (Section 2.2) or 'global' (Section 2.1)
  seedingMode: SeedingMode; // 'random' (0-255) or 'balanced' (Instructions + Junk)
  stepsPerFrame: number;
  seed: number; // Deterministic seed
}

export interface SpeciesData {
    rank: number;
    code: string;
    count: number;
    dominance: number; // 0.0 to 1.0 (percentage of grid)
    entropy: number;
}

export interface CensusData {
    speciesCount: number; // Total unique genomes
    topSpecies: SpeciesData[]; // List of top dominant species (e.g. top 5)
}

export interface SimulationStats {
  epoch: number;
  avgComplexity: number; // Average instructions executed per interaction
  replicationRate: number; // Average copy operations per interaction (Total)
  effectiveReplication: number; // Copy operations that actually touched neighbor memory (Viable)
  entropy: number; // Shannon entropy of the grid (measure of order)
  zeroDensity: number; // Percentage of the grid filled with 0x00 (Sign of Zero-Poisoning)
  census?: CensusData; // Periodic snapshot of species
  lastCensusEpoch?: number; // Epoch at which the last census was performed
}
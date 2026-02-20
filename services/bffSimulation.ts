// BFF (Brainfuck Extended) Simulation Engine
import { SimulationConfig, CensusData, SimulationStats, SpeciesData } from '../types';

/**
 * --- SIMULATION PARAMETERS & PHYSICS ---
 * 
 * Documentation references: 
 * "Computational Life: How Well-formed, Self-replicating Programs Emerge from Simple Interaction"
 * Agüera y Arcas et al. (2024)
 */

// ASCII mappings for BFF commands
export const CMD_LEFT = 60; // <
export const CMD_RIGHT = 62; // >
export const CMD_H1_DEC = 123; // {
export const CMD_H1_INC = 125; // }
export const CMD_DEC = 45; // -
export const CMD_INC = 43; // +
export const CMD_COPY_0_TO_1 = 46; // .
export const CMD_COPY_1_TO_0 = 44; // ,
export const CMD_JZ = 91; // [
export const CMD_JNZ = 93; // ]

// Valid instruction set for Balanced Seeding
const VALID_OPS = [
  CMD_LEFT, CMD_RIGHT, 
  CMD_H1_DEC, CMD_H1_INC, 
  CMD_DEC, CMD_INC, 
  CMD_COPY_0_TO_1, CMD_COPY_1_TO_0, 
  CMD_JZ, CMD_JNZ
];

/**
 * Simple Fast PRNG (Mulberry32) for deterministic simulations.
 */
class PRNG {
  private state: number;
  constructor(seed: number) {
    this.state = seed;
  }
  
  // Returns a float between 0 and 1
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

export class BFFSimulation {
  config: SimulationConfig;
  width: number;
  height: number;
  data: Uint8Array; // Stores all tapes flattened: [width * height * config.tapeSize]
  private interactionBuffer: Uint8Array; // Optimization: Reusable buffer to avoid GC in hot loops
  private jumpTable: Int16Array; // Optimization: Pre-computed jump targets
  private rng: PRNG;
  
  // Statistics State
  stats: SimulationStats = {
    epoch: 0,
    avgComplexity: 0,
    replicationRate: 0,
    effectiveReplication: 0,
    entropy: 8.0, // Max entropy for bytes
    zeroDensity: 0,
    census: {
        speciesCount: 0,
        topSpecies: []
    },
    lastCensusEpoch: 0
  };

  // History of stats for analysis (Optimized: sparsely populated)
  history: SimulationStats[] = [];
  
  // Track the last stats pushed to history for compression logic
  private lastHistoryStats: SimulationStats | null = null;

  private epochInteractions = 0;
  private epochTotalComplexity = 0;
  private epochTotalCopies = 0;
  private epochTotalEffectiveCopies = 0;
  private readonly epochSize: number;
  private readonly CENSUS_INTERVAL = 50; // Run expensive census every 50 epochs

  constructor(config: SimulationConfig) {
    this.config = config;
    this.width = config.gridWidth;
    this.height = config.gridHeight;
    this.epochSize = this.width * this.height; // One epoch = statistical update of all cells
    this.data = new Uint8Array(this.width * this.height * this.config.tapeSize);
    this.interactionBuffer = new Uint8Array(this.config.tapeSize * 2);
    this.jumpTable = new Int16Array(this.config.tapeSize * 2);
    this.rng = new PRNG(config.seed);
    this.reset();
  }

  /**
   * Updates configuration on the fly.
   */
  updateConfig(newConfig: SimulationConfig) {
    // If grid dimensions change or seed changes, we must reset.
    const mustReset = 
        newConfig.gridWidth !== this.width || 
        newConfig.gridHeight !== this.height || 
        newConfig.tapeSize !== this.config.tapeSize ||
        newConfig.seed !== this.config.seed;

    if (mustReset) {
        this.config = newConfig;
        this.width = newConfig.gridWidth;
        this.height = newConfig.gridHeight;
        this.data = new Uint8Array(this.width * this.height * this.config.tapeSize);
        this.interactionBuffer = new Uint8Array(this.config.tapeSize * 2);
        this.jumpTable = new Int16Array(this.config.tapeSize * 2);
        // Important: Update RNG with the new seed!
        this.rng = new PRNG(this.config.seed);
        this.reset();
    } else {
        // Just update physics parameters
        this.config = newConfig;
    }
  }

  reset() {
    // Ensure RNG is reset to the initial seed for this configuration to guarantee repeatability.
    this.rng = new PRNG(this.config.seed);

    // Initialization Strategy
    if (this.config.seedingMode === 'balanced') {
      // Balanced Mode: Equal probability for each Instruction + 1 slot for Junk (0)
      const choices = [...VALID_OPS, 0]; 
      for (let i = 0; i < this.data.length; i++) {
        this.data[i] = choices[Math.floor(this.rng.next() * choices.length)];
      }
    } else {
      // Random Mode (Default): Uniform distribution 0-255.
      for (let i = 0; i < this.data.length; i++) {
        this.data[i] = (this.rng.next() * 256) | 0; // Bitwise optimization
      }
    }

    // Capture baseline stats (Epoch 0) before any interaction
    const metrics = this.calculateGridMetrics();
    const initialCensus = this.performCensus();

    this.stats = {
      epoch: 0,
      avgComplexity: 0,
      replicationRate: 0,
      effectiveReplication: 0,
      entropy: metrics.entropy,
      zeroDensity: metrics.zeroDensity,
      census: initialCensus,
      lastCensusEpoch: 0
    };
    
    // Clear history and record the baseline snapshot
    this.history = [];
    this.history.push({ ...this.stats });
    this.lastHistoryStats = { ...this.stats };

    this.epochInteractions = 0;
    this.epochTotalComplexity = 0;
    this.epochTotalCopies = 0;
    this.epochTotalEffectiveCopies = 0;
  }

  getCellAt(x: number, y: number): Uint8Array {
    const sx = (x + this.width) % this.width;
    const sy = (y + this.height) % this.height;
    const idx = (sy * this.width + sx) * this.config.tapeSize;
    return this.data.slice(idx, idx + this.config.tapeSize);
  }

  step(interactions: number) {
    for (let i = 0; i < interactions; i++) {
      this.interact();
    }
  }

  interact() {
    const tapeSize = this.config.tapeSize;
    
    // 1. Pick Agent A (Random)
    // Optimization: Bitwise OR 0 is faster than Math.floor for positive integers
    const x = (this.rng.next() * this.width) | 0;
    const y = (this.rng.next() * this.height) | 0;
    const idxA = (y * this.width + x) * tapeSize;

    // 2. Pick Agent B based on Topology
    let nx, ny;
    
    if (this.config.topology === 'global') {
      do {
        nx = (this.rng.next() * this.width) | 0;
        ny = (this.rng.next() * this.height) | 0;
      } while (nx === x && ny === y); 
    } else {
      const dx = ((this.rng.next() * 5) | 0) - 2; // -2 to 2
      const dy = ((this.rng.next() * 5) | 0) - 2; // -2 to 2
      
      if (dx === 0 && dy === 0) return; // No self-interaction

      nx = (x + dx + this.width) % this.width;
      ny = (y + dy + this.height) % this.height;
    }

    const idxB = (ny * this.width + nx) * tapeSize;

    // 3. Concatenate Tapes
    // Optimization: Use pre-allocated buffer and manual copy loop 
    // to avoid creating Subarray/View objects every interaction.
    const tape = this.interactionBuffer;
    
    for (let i = 0; i < tapeSize; i++) {
        tape[i] = this.data[idxA + i];
        tape[tapeSize + i] = this.data[idxB + i];
    }

    // 4. Execute
    const { complexity, copies, neighborWrites } = this.execute(tape);

    this.epochTotalComplexity += complexity;
    this.epochTotalCopies += copies;
    this.epochTotalEffectiveCopies += neighborWrites;
    this.epochInteractions++;

    if (this.epochInteractions >= this.epochSize) {
        this.completeEpoch();
    }

    // 5. Split and Update (Manual copy back)
    for (let i = 0; i < tapeSize; i++) {
        this.data[idxA + i] = tape[i];
        this.data[idxB + i] = tape[tapeSize + i];
    }
  }

  mutate() {
    if (this.config.mutationRate <= 0) return;

    const totalBytes = this.data.length;
    const expectedMutations = totalBytes * this.config.mutationRate;
    
    let numMutations = Math.floor(expectedMutations);
    if (this.rng.next() < (expectedMutations - numMutations)) {
        numMutations++;
    }

    for (let i = 0; i < numMutations; i++) {
        const idx = (this.rng.next() * totalBytes) | 0;
        this.data[idx] = (this.rng.next() * 256) | 0;
    }
  }

  completeEpoch() {
    this.mutate();
    this.stats.epoch++;
    
    // Performance Optimization Strategy:
    // 1. Accumulators (Complexity, Copies) are updated per interaction (FAST). 
    //    We just average them here.
    this.stats.avgComplexity = this.epochTotalComplexity / this.epochSize;
    this.stats.replicationRate = this.epochTotalCopies / this.epochSize;
    this.stats.effectiveReplication = this.epochTotalEffectiveCopies / this.epochSize;
    
    // 2. Grid Metrics (Entropy, Zero Density) run every epoch to provide smooth real-time graphs.
    //    Uses 10% sampling which is efficient enough (~1-2ms for 64x64 grid).
    const metrics = this.calculateGridMetrics();
    this.stats.entropy = metrics.entropy;
    this.stats.zeroDensity = metrics.zeroDensity;

    // 3. Census (Species Dominance) is HEAVY.
    //    It involves string creation and map sorting.
    //    We run this on an interval but RETAIN the previous data to prevent UI flicker.
    const isCensusEpoch = this.stats.epoch % this.CENSUS_INTERVAL === 0;

    if (isCensusEpoch) {
        this.stats.census = this.performCensus();
        this.stats.lastCensusEpoch = this.stats.epoch;
    } 
    // IMPORTANT: Else, keep existing this.stats.census. Do not overwrite with undefined.

    // --- Smart History Compression ---
    // Instead of pushing every epoch (which crashes memory on long runs),
    // we only push "Interesting" epochs.
    let shouldLog = false;
    
    // 1. Always log census epochs
    if (isCensusEpoch) {
        shouldLog = true;
    } 
    // 2. Log if significant change occurred since last log
    else if (this.lastHistoryStats) {
        const dEntropy = Math.abs(this.stats.entropy - this.lastHistoryStats.entropy);
        const dZero = Math.abs(this.stats.zeroDensity - this.lastHistoryStats.zeroDensity);
        
        // Thresholds: 0.1 Entropy (visible structure change), 0.05 Zero (visible poisoning)
        if (dEntropy > 0.1 || dZero > 0.05) {
            shouldLog = true;
        }
    } else {
        // Fallback for first run
        shouldLog = true;
    }

    if (shouldLog) {
        const snapshot = { ...this.stats }; // Clone
        this.history.push(snapshot);
        this.lastHistoryStats = snapshot;
    }

    // Reset counters
    this.epochInteractions = 0;
    this.epochTotalComplexity = 0;
    this.epochTotalCopies = 0;
    this.epochTotalEffectiveCopies = 0;
  }

  performCensus(): CensusData {
    const speciesMap = new Map<string, number>();
    const totalCells = this.width * this.height;
    const tapeSize = this.config.tapeSize;

    // Optimization: Census Sampling
    // Use a percentage (10%) of the board to estimate populations.
    // Crucially, use deterministic strided sampling (no RNG) to preserve
    // the main physics PRNG sequence. This ensures that observation
    // does not alter the timeline.
    const SAMPLE_RATE = 0.1;
    let step = Math.floor(1 / SAMPLE_RATE);
    
    // Ensure stride is odd to avoid trivial resonance with even power-of-2 grid widths
    if ((step & 1) === 0) step++; 

    let actualSampleCount = 0;

    for (let i = 0; i < totalCells; i += step) {
        const start = i * tapeSize;
        
        // Use subarray (view) to avoid copying, but toString() still copies.
        const genome = this.data.subarray(start, start + tapeSize);
        const key = genome.toString(); // "1,2,3"
        speciesMap.set(key, (speciesMap.get(key) || 0) + 1);
        actualSampleCount++;
    }

    // Convert map to array and sort by count desc
    const sortedSpecies = Array.from(speciesMap.entries())
        .sort((a, b) => b[1] - a[1]) // Sort by count desc
        .slice(0, 5); // Take top 5

    const topSpecies: SpeciesData[] = sortedSpecies.map(([code, count], index) => {
        const genomeBytes = code.split(',').map(Number);
        const dominance = count / actualSampleCount;

        return {
            rank: index + 1,
            code: code,
            // Project estimated count for UI consistency (Sampled Count * Ratio)
            count: Math.floor(dominance * totalCells),
            dominance: dominance,
            entropy: BFFSimulation.calculateGenomeEntropy(new Uint8Array(genomeBytes))
        };
    });

    return {
        speciesCount: speciesMap.size, // Diversity within the sampled set
        topSpecies: topSpecies
    };
  }

  /**
   * Helper: Calculate Shannon Entropy of a single genome
   */
  static calculateGenomeEntropy(genome: Uint8Array): number {
    const counts = new Int32Array(256);
    for (let i = 0; i < genome.length; i++) {
        counts[genome[i]]++;
    }

    let entropy = 0;
    for (let i = 0; i < 256; i++) {
        if (counts[i] > 0) {
            const p = counts[i] / genome.length;
            entropy -= p * Math.log2(p);
        }
    }
    return entropy;
  }

  // Optimized Global Metrics with Sampling
  calculateGridMetrics(): { entropy: number, zeroDensity: number } {
    const counts = new Int32Array(256);
    const len = this.data.length;
    
    // Sampling Strategy:
    // Sample 10% of the bytes. This scales linearly with grid size.
    // Use strided sampling (no RNG) to keep statistics deterministic
    // and separate from physics.
    const SAMPLE_RATE = 0.1;
    let step = Math.floor(1 / SAMPLE_RATE);
    
    // Ensure step is odd to be coprime with power-of-2 tape sizes (avoiding grid alignment artifacts)
    if ((step & 1) === 0) step++; 

    let samples = 0;
    // Use a fixed loop to ensure we don't go out of bounds
    for (let i = 0; i < len; i += step) {
        counts[this.data[i]]++;
        samples++;
    }

    let entropy = 0;
    for (let i = 0; i < 256; i++) {
        if (counts[i] > 0) {
            const p = counts[i] / samples;
            entropy -= p * Math.log2(p);
        }
    }

    return {
        entropy,
        zeroDensity: counts[0] / samples
    };
  }

  execute(tape: Uint8Array): { complexity: number, copies: number, neighborWrites: number } {
    let head0 = 0;
    let head1 = 0; 
    let ip = 0; 
    let cycles = 0; 
    let complexity = 0; 
    let copies = 0;
    let neighborWrites = 0;
    
    // Dynamic physics based on configuration
    const len = this.config.tapeSize * 2; // e.g. 128 (64*2) or 512 (256*2)
    const mask = len - 1; // 127 or 511. Requires Power of 2 tapeSize!
    const neighborThreshold = this.config.tapeSize; // 64 or 256
    
    // Optimization: Hoist limit check
    const limit = this.config.instructionLimit;
    const jumps = this.jumpTable;

    // Optimization: Pre-compute Jump Table (O(TapeSize)) to save O(Complexity * TapeSize)
    // Initialize jumps to -1 (invalid)
    for(let i=0; i<len; i++) jumps[i] = -1;

    for (let i = 0; i < len; i++) {
        if (tape[i] === CMD_JZ) { // [
            // Scan Forward
            let depth = 1;
            let scanIp = i + 1;
            let scanned = 0;
            // NOTE: We scan up to len (full tape wrap) to match runtime logic
            while (depth > 0 && scanned < len) {
                const instr = tape[scanIp & mask];
                if (instr === CMD_JZ) depth++;
                else if (instr === CMD_JNZ) depth--;
                scanIp++;
                scanned++;
            }
            if (depth === 0) {
                // Point to matching ]
                jumps[i] = (scanIp - 1) & mask;
            }
        } else if (tape[i] === CMD_JNZ) { // ]
            // Scan Backward
            let depth = 1;
            let scanIp = i - 1;
            let scanned = 0;
            while (depth > 0 && scanned < len) {
                const instr = tape[scanIp & mask];
                if (instr === CMD_JNZ) depth++;
                else if (instr === CMD_JZ) depth--;
                scanIp--;
                scanned++;
            }
            if (depth === 0) {
                // Point to matching [
                jumps[i] = (scanIp + 1) & mask;
            }
        }
    }

    while (cycles < limit) {
      const currentIp = ip & mask;
      const instr = tape[currentIp];
      let isValidOp = true;

      switch (instr) {
        case CMD_LEFT: head0 = (head0 - 1) & mask; break;
        case CMD_RIGHT: head0 = (head0 + 1) & mask; break;
        case CMD_H1_DEC: head1 = (head1 - 1) & mask; break;
        case CMD_H1_INC: head1 = (head1 + 1) & mask; break;
        case CMD_DEC: tape[head0 & mask] = (tape[head0 & mask] - 1) & 255; break;
        case CMD_INC: tape[head0 & mask] = (tape[head0 & mask] + 1) & 255; break;
        case CMD_COPY_0_TO_1: // .
          tape[head1 & mask] = tape[head0 & mask];
          copies++;
          // Viability Check: Are we writing to the neighbor's tape?
          if ((head1 & mask) >= neighborThreshold) {
              neighborWrites++;
          }
          break;
        case CMD_COPY_1_TO_0: // ,
          tape[head0 & mask] = tape[head1 & mask];
          copies++;
          break;
        case CMD_JZ: // [
          if (tape[head0 & mask] === 0) {
             const target = jumps[currentIp];
             if (target !== -1) {
                 // Jump to matching ]
                 // Loop logic: ip will increment at end.
                 // We want next instruction to be AFTER ].
                 // So ip should become target. ip++ -> target + 1. Correct.
                 ip = target;
             } else {
                 // Unmatched bracket: Exit loop / Stop execution?
                 // Original code would fail 'depth > 0' check and return.
                 return { complexity, copies, neighborWrites };
             }
          }
          break;
        case CMD_JNZ: // ]
          if (tape[head0 & mask] !== 0) {
             const target = jumps[currentIp];
             if (target !== -1) {
                 // Jump to matching [
                 // Loop logic: ip will increment at end.
                 // We want next instruction to be AFTER [. (Start of body)
                 // So ip should become target. ip++ -> target + 1. Correct.
                 ip = target;
             } else {
                 return { complexity, copies, neighborWrites };
             }
          }
          break;
        default: isValidOp = false; break;
      }

      if (isValidOp) complexity++;
      ip++;
      cycles++;
    }

    return { complexity, copies, neighborWrites };
  }
}

// Shared color logic for UI and WebGL Palette
export function getByteColor(byte: number): { r: number, g: number, b: number } {
    let r = 0, g = 0, b = 0;
    
    // Unified Color Palette (Pairs share colors)
    
    // MOVE (Red)
    if (byte === CMD_LEFT || byte === CMD_RIGHT) { 
        r = 255; g = 60; b = 60; 
    } 
    // AUX (Blue)
    else if (byte === CMD_H1_DEC || byte === CMD_H1_INC) { 
        r = 60; g = 120; b = 255; 
    } 
    // MATH (Green)
    else if (byte === CMD_DEC || byte === CMD_INC) { 
        r = 60; g = 255; b = 60; 
    } 
    // COPY (Orange) - Unified for 'Orange Goo' effect
    else if (byte === CMD_COPY_0_TO_1 || byte === CMD_COPY_1_TO_0) { 
        r = 255; g = 140; b = 0; 
    } 
    // LOOP (Purple)
    else if (byte === CMD_JZ || byte === CMD_JNZ) { 
        r = 180; g = 50; b = 255; 
    } 
    else {
      // Non-instruction data: Grayscale noise based on value
      if (byte === 0) {
         r = 0; g = 0; b = 0; // Pure Black for Zero
      } else {
         // Dark gray noise (Range 20-50).
         // Was previously too bright (up to ~140).
         const val = 20 + (byte % 30); 
         r = val; g = val; b = val;
      }
    }
    return { r, g, b };
}

// Helper to generate a palette texture
export function generatePalette(): Uint8Array {
  const palette = new Uint8Array(256 * 4); // RGBA
  
  for (let i = 0; i < 256; i++) {
    const { r, g, b } = getByteColor(i);
    palette[i * 4 + 0] = r;
    palette[i * 4 + 1] = g;
    palette[i * 4 + 2] = b;
    palette[i * 4 + 3] = 255; // Alpha
  }
  return palette;
}
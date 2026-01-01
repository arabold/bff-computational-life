// BFF (Brainfuck Extended) Simulation Engine
import { SimulationConfig, CensusData, SimulationStats } from '../types';

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
        topSpeciesCode: '',
        topSpeciesCount: 0,
        dominance: 0,
        topSpeciesEntropy: 0
    }
  };

  // History of stats for analysis
  history: SimulationStats[] = [];

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
      census: initialCensus
    };
    
    // Clear history and record the baseline snapshot
    this.history = [];
    this.history.push({ ...this.stats });

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
    
    this.stats.avgComplexity = this.epochTotalComplexity / this.epochSize;
    this.stats.replicationRate = this.epochTotalCopies / this.epochSize;
    this.stats.effectiveReplication = this.epochTotalEffectiveCopies / this.epochSize;
    
    // Efficiently calculate Entropy and Zero Density in one pass
    const metrics = this.calculateGridMetrics();
    this.stats.entropy = metrics.entropy;
    this.stats.zeroDensity = metrics.zeroDensity;

    if (this.stats.epoch % this.CENSUS_INTERVAL === 0) {
        this.stats.census = this.performCensus();
    }

    this.history.push({ 
        ...this.stats, 
        census: (this.stats.epoch % this.CENSUS_INTERVAL === 0) ? this.stats.census : undefined
    });

    this.epochInteractions = 0;
    this.epochTotalComplexity = 0;
    this.epochTotalCopies = 0;
    this.epochTotalEffectiveCopies = 0;
  }

  performCensus(): CensusData {
    const speciesMap = new Map<string, number>();
    const totalCells = this.width * this.height;
    const tapeSize = this.config.tapeSize;

    // First Pass: Count species
    for (let i = 0; i < totalCells; i++) {
        const start = i * tapeSize;
        const genome = this.data.subarray(start, start + tapeSize);
        const key = genome.toString(); // "1,2,3"
        speciesMap.set(key, (speciesMap.get(key) || 0) + 1);
    }

    // Find top species
    let topCode = '';
    let topCount = 0;
    
    for (const [code, count] of speciesMap.entries()) {
        if (count > topCount) {
            topCount = count;
            topCode = code;
        }
    }

    // Calculate Entropy of Top Species
    // Only parse if we have a winner
    let topSpeciesEntropy = 0;
    if (topCode) {
        const genomeBytes = topCode.split(',').map(Number);
        topSpeciesEntropy = BFFSimulation.calculateGenomeEntropy(new Uint8Array(genomeBytes));
    }

    return {
        speciesCount: speciesMap.size,
        topSpeciesCode: topCode, 
        topSpeciesCount: topCount,
        dominance: topCount / totalCells,
        topSpeciesEntropy: topSpeciesEntropy
    };
  }

  /**
   * Helper: Calculate Shannon Entropy of a single genome
   * High Entropy (~4+) = Complex / Random
   * Low Entropy (<1) = Repetitive / Crystal
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

  // Optimized Global Metrics
  calculateGridMetrics(): { entropy: number, zeroDensity: number } {
    const counts = new Int32Array(256);
    const len = this.data.length;
    
    // Single pass over the entire grid data
    for (let i = 0; i < len; i++) {
        counts[this.data[i]]++;
    }

    let entropy = 0;
    for (let i = 0; i < 256; i++) {
        if (counts[i] > 0) {
            const p = counts[i] / len;
            entropy -= p * Math.log2(p);
        }
    }

    return {
        entropy,
        zeroDensity: counts[0] / len
    };
  }

  // Deprecated: Kept for compatibility if needed
  calculateEntropy(): number {
      return this.calculateGridMetrics().entropy;
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
          // Reading from neighbor usually, doesn't count as writing *to* them.
          break;
        case CMD_JZ: 
          if (tape[head0 & mask] === 0) {
            let depth = 1;
            let scanIp = ip + 1;
            let scanned = 0;
            while (depth > 0 && scanned < len) {
                const scanInstr = tape[scanIp & mask];
                if (scanInstr === CMD_JZ) depth++;
                else if (scanInstr === CMD_JNZ) depth--;
                scanIp++;
                scanned++;
            }
            if (depth === 0) ip = scanIp - 1; 
            else return { complexity, copies, neighborWrites };
          }
          break;
        case CMD_JNZ: 
          if (tape[head0 & mask] !== 0) {
             let depth = 1;
             let scanIp = ip - 1;
             let scanned = 0;
             while (depth > 0 && scanned < len) {
                 const scanInstr = tape[scanIp & mask];
                 if (scanInstr === CMD_JNZ) depth++;
                 else if (scanInstr === CMD_JZ) depth--;
                 scanIp--;
                 scanned++;
             }
             if (depth === 0) ip = scanIp + 1;
             else return { complexity, copies, neighborWrites };
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
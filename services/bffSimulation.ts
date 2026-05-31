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
  private _data: Uint8Array; // Temp buffer for WASM-sync loading or fallback initialization
  private rng: PRNG;
  
  // Statistics State
  stats: SimulationStats = {
    epoch: 0,
    avgComplexity: 0,
    replicationRate: 0,
    effectiveReplication: 0,
    entropy: 8.0,
    zeroDensity: 0,
    census: {
        speciesCount: 0,
        topSpecies: []
    },
    lastCensusEpoch: 0
  };

  // History of stats for analysis (sparse logging)
  history: SimulationStats[] = [];
  
  private lastHistoryStats: SimulationStats | null = null;
  private readonly CENSUS_INTERVAL = 50; // Run expensive census every 50 epochs

  // WebAssembly Engine integration
  public isWasmActive: boolean = false;
  private wasmInstance: any = null;
  public wasmLoaded: Promise<void>;

  get data(): Uint8Array {
    if (this.isWasmActive && this.wasmInstance) {
      const exports = this.wasmInstance.exports;
      const offset = Number(exports.getDataOffset());
      return new Uint8Array(exports.memory.buffer, offset, this.width * this.height * this.config.tapeSize);
    }
    return this._data;
  }

  constructor(config: SimulationConfig) {
    this.config = config;
    this.width = config.gridWidth;
    this.height = config.gridHeight;
    this._data = new Uint8Array(this.width * this.height * this.config.tapeSize);
    this.rng = new PRNG(config.seed);
    this.reset();

    // Start loading the Wasm module asynchronously
    this.wasmLoaded = fetch('/simulation.wasm')
      .then(res => {
        if (!res.ok) throw new Error("Failed to fetch WebAssembly binary");
        return res.arrayBuffer();
      })
      .then(bytes => {
        const importObject = {
          env: {
            abort: (message: number, fileName: number, line: number, column: number) => {
              console.error(`Wasm aborted inside simulation.ts at line ${line}, col ${column}`);
            },
            seed: () => Math.random()
          }
        };
        return WebAssembly.instantiate(bytes, importObject);
      })
      .then(result => {
        this.wasmInstance = result.instance;
        this.initWasm();
      })
      .catch(err => {
        console.error("WebAssembly Simulation Engine failed to load:", err);
      });
  }

  private initWasm() {
    if (!this.wasmInstance) return;
    const exports = this.wasmInstance.exports;
    
    const topVal = this.config.topology === 'global' ? 1 : 0;
    const seedModeVal = this.config.seedingMode === 'balanced' ? 1 : 0;

    exports.init(
      this.width,
      this.height,
      this.config.tapeSize,
      seedModeVal,
      this.config.seed,
      this.config.mutationRate,
      this.config.instructionLimit,
      topVal
    );

    // Sync state: Copy current initial grid data to Wasm memory
    const offset = Number(exports.getDataOffset());
    const wasmMem = exports.memory;
    const wasmView = new Uint8Array(wasmMem.buffer, offset, this._data.length);
    wasmView.set(this._data);

    this.isWasmActive = true;
    console.log("WebAssembly Simulation Engine active! Execution accelerated by WASM.");
  }

  /**
   * Updates configuration on the fly.
   */
  updateConfig(newConfig: SimulationConfig) {
    const mustReset = 
        newConfig.gridWidth !== this.width || 
        newConfig.gridHeight !== this.height || 
        newConfig.tapeSize !== this.config.tapeSize ||
        newConfig.seed !== this.config.seed;

    if (mustReset) {
        this.config = newConfig;
        this.width = newConfig.gridWidth;
        this.height = newConfig.gridHeight;
        this._data = new Uint8Array(this.width * this.height * this.config.tapeSize);
        this.rng = new PRNG(this.config.seed);
        
        if (this.isWasmActive && this.wasmInstance) {
           const exports = this.wasmInstance.exports;
           const seedModeVal = this.config.seedingMode === 'balanced' ? 1 : 0;
           const topVal = this.config.topology === 'global' ? 1 : 0;
           exports.init(
             this.width,
             this.height,
             this.config.tapeSize,
             seedModeVal,
             this.config.seed,
             this.config.mutationRate,
             this.config.instructionLimit,
             topVal
           );
        }
        this.reset();
    } else {
        this.config = newConfig;
        if (this.isWasmActive && this.wasmInstance) {
          const exports = this.wasmInstance.exports;
          const topVal = this.config.topology === 'global' ? 1 : 0;
          exports.updateParams(this.config.mutationRate, this.config.instructionLimit, topVal);
        }
    }
  }

  reset() {
    this.rng = new PRNG(this.config.seed);

    if (this.isWasmActive && this.wasmInstance) {
      const exports = this.wasmInstance.exports;
      const seedModeVal = this.config.seedingMode === 'balanced' ? 1 : 0;
      const topVal = this.config.topology === 'global' ? 1 : 0;
      exports.init(
        this.width,
        this.height,
        this.config.tapeSize,
        seedModeVal,
        this.config.seed,
        this.config.mutationRate,
        this.config.instructionLimit,
        topVal
      );

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

      this.history = [];
      this.history.push({ ...this.stats });
      this.lastHistoryStats = { ...this.stats };
      return;
    }

    // Seeding prior to Wasm load
    if (this.config.seedingMode === 'balanced') {
      const choices = [...VALID_OPS, 0]; 
      for (let i = 0; i < this._data.length; i++) {
        this._data[i] = choices[Math.floor(this.rng.next() * choices.length)];
      }
    } else {
      for (let i = 0; i < this._data.length; i++) {
        this._data[i] = (this.rng.next() * 256) | 0;
      }
    }

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
    
    this.history = [];
    this.history.push({ ...this.stats });
    this.lastHistoryStats = { ...this.stats };
  }

  getCellAt(x: number, y: number): Uint8Array {
    const sx = (x + this.width) % this.width;
    const sy = (y + this.height) % this.height;
    const idx = (sy * this.width + sx) * this.config.tapeSize;
    return this.data.slice(idx, idx + this.config.tapeSize);
  }

  step(interactions: number) {
    if (this.isWasmActive && this.wasmInstance) {
      const exports = this.wasmInstance.exports;
      exports.step(interactions);

      // Check for completed epochs inside WebAssembly
      if (exports.getWasEpochCompleted() === 1) {
        exports.clearWasEpochCompleted();

        this.stats.epoch = exports.getEpoch();
        this.stats.avgComplexity = exports.getLastEpochComplexity();
        this.stats.replicationRate = exports.getLastEpochCopies();
        this.stats.effectiveReplication = exports.getLastEpochEffectiveCopies();

        const metrics = this.calculateGridMetrics();
        this.stats.entropy = metrics.entropy;
        this.stats.zeroDensity = metrics.zeroDensity;

        const isCensusEpoch = this.stats.epoch % this.CENSUS_INTERVAL === 0;
        if (isCensusEpoch) {
          this.stats.census = this.performCensus();
          this.stats.lastCensusEpoch = this.stats.epoch;
        }

        let shouldLog = false;
        if (isCensusEpoch) {
          shouldLog = true;
        } else if (this.lastHistoryStats) {
          const dEntropy = Math.abs(this.stats.entropy - this.lastHistoryStats.entropy);
          const dZero = Math.abs(this.stats.zeroDensity - this.lastHistoryStats.zeroDensity);
          if (dEntropy > 0.1 || dZero > 0.05) {
            shouldLog = true;
          }
        } else {
          shouldLog = true;
        }

        if (shouldLog) {
          const snapshot = { ...this.stats };
          this.history.push(snapshot);
          this.lastHistoryStats = snapshot;
        }
      }
    }
  }

  performCensus(): CensusData {
    const speciesMap = new Map<string, number>();
    const totalCells = this.width * this.height;
    const tapeSize = this.config.tapeSize;

    // Strided sampling (10% subset) to avoid changing randomness trajectory of the simulation
    const SAMPLE_RATE = 0.1;
    let step = Math.floor(1 / SAMPLE_RATE);
    
    if ((step & 1) === 0) step++; 

    let actualSampleCount = 0;

    for (let i = 0; i < totalCells; i += step) {
        const start = i * tapeSize;
        const genome = this.data.subarray(start, start + tapeSize);
        const key = genome.toString();
        speciesMap.set(key, (speciesMap.get(key) || 0) + 1);
        actualSampleCount++;
    }

    const sortedSpecies = Array.from(speciesMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    const topSpecies: SpeciesData[] = sortedSpecies.map(([code, count], index) => {
        const genomeBytes = code.split(',').map(Number);
        const dominance = count / actualSampleCount;

        return {
            rank: index + 1,
            code: code,
            count: Math.floor(dominance * totalCells),
            dominance: dominance,
            entropy: BFFSimulation.calculateGenomeEntropy(new Uint8Array(genomeBytes))
        };
    });

    return {
        speciesCount: speciesMap.size,
        topSpecies: topSpecies
    };
  }

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

  calculateGridMetrics(): { entropy: number, zeroDensity: number } {
    const counts = new Int32Array(256);
    const len = this.data.length;
    
    const SAMPLE_RATE = 0.1;
    let step = Math.floor(1 / SAMPLE_RATE);
    
    if ((step & 1) === 0) step++; 

    let samples = 0;
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
}

// Shared color logic for UI and WebGL Palette
export function getByteColor(byte: number): { r: number, g: number, b: number } {
    let r = 0, g = 0, b = 0;
    
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
    // COPY (Orange)
    else if (byte === CMD_COPY_0_TO_1 || byte === CMD_COPY_1_TO_0) { 
        r = 255; g = 140; b = 0; 
    } 
    // LOOP (Purple)
    else if (byte === CMD_JZ || byte === CMD_JNZ) { 
        r = 180; g = 50; b = 255; 
    } 
    else {
      if (byte === 0) {
         r = 0; g = 0; b = 0;
      } else {
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
    palette[i * 4 + 3] = 255;
  }
  return palette;
}

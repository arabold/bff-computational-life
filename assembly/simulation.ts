// BFF WebAssembly Core Simulation (AssemblyScript)

const CMD_LEFT: u8 = 60; // <
const CMD_RIGHT: u8 = 62; // >
const CMD_H1_DEC: u8 = 123; // {
const CMD_H1_INC: u8 = 125; // }
const CMD_DEC: u8 = 45; // -
const CMD_INC: u8 = 43; // +
const CMD_COPY_0_TO_1: u8 = 46; // .
const CMD_COPY_1_TO_0: u8 = 44; // ,
const CMD_JZ: u8 = 91; // [
const CMD_JNZ: u8 = 93; // ]

const VALID_OPS: StaticArray<u8> = [60, 62, 123, 125, 45, 43, 46, 44, 91, 93];

// Shared simulation parameters
let gridWidth: i32 = 64;
let gridHeight: i32 = 64;
let tapeSize: i32 = 64;
let mutationRate: f64 = 0.00024;
let instructionLimit: i32 = 8192;
let topology: i32 = 0; // 0 = spatial, 1 = global
let seedingMode: i32 = 0; // 0 = random, 1 = balanced
let seed: u32 = 123456;

// Dynamic state arrays
let gridData: Uint8Array = new Uint8Array(0);
let interactionBuffer: Uint8Array = new Uint8Array(0);
let jumpTable: Int16Array = new Int16Array(0);

// PRNG State
let prngState: u32 = 123456;

function rngNext(): f64 {
  prngState = prngState + 0x6d2b79f5;
  let t = prngState;
  t = (t ^ (t >>> 15)) * (t | 1);
  t ^= t + (t ^ (t >>> 7)) * (t | 61);
  return f64((t ^ (t >>> 14)) >>> 0) / 4294967296.0;
}

// Running metrics
let epoch: i32 = 0;
let epochInteractions: i32 = 0;
let epochTotalComplexity: f64 = 0.0;
let epochTotalCopies: f64 = 0.0;
let epochTotalEffectiveCopies: f64 = 0.0;

// Epoch complete signals
let wasEpochCompleted: i32 = 0;
let lastEpochComplexity: f64 = 0.0;
let lastEpochCopies: f64 = 0.0;
let lastEpochEffectiveCopies: f64 = 0.0;

export function init(
  w: i32,
  h: i32,
  tSize: i32,
  sMode: i32,
  seedVal: u32,
  mutRate: f64,
  limit: i32,
  top: i32
): void {
  gridWidth = w;
  gridHeight = h;
  tapeSize = tSize;
  seedingMode = sMode;
  seed = seedVal;
  mutationRate = mutRate;
  instructionLimit = limit;
  topology = top;

  prngState = seed;

  const totalBytes = gridWidth * gridHeight * tapeSize;
  gridData = new Uint8Array(totalBytes);
  interactionBuffer = new Uint8Array(tapeSize * 2);
  jumpTable = new Int16Array(tapeSize * 2);

  epoch = 0;
  epochInteractions = 0;
  epochTotalComplexity = 0.0;
  epochTotalCopies = 0.0;
  epochTotalEffectiveCopies = 0.0;

  wasEpochCompleted = 0;
  lastEpochComplexity = 0.0;
  lastEpochCopies = 0.0;
  lastEpochEffectiveCopies = 0.0;

  if (seedingMode == 1) { // Balanced
    for (let i = 0; i < totalBytes; i++) {
      let r = rngNext();
      let choiceIdx = i32(r * 11.0);
      if (choiceIdx < 10) {
        gridData[i] = VALID_OPS[choiceIdx];
      } else {
        gridData[i] = 0;
      }
    }
  } else { // Random
    for (let i = 0; i < totalBytes; i++) {
      gridData[i] = u8(rngNext() * 256.0);
    }
  }
}

export function updateParams(mutRate: f64, limit: i32, top: i32): void {
  mutationRate = mutRate;
  instructionLimit = limit;
  topology = top;
}

export function getDataOffset(): usize {
  return gridData.dataStart;
}

export function getByte(idx: i32): u8 {
  return gridData[idx];
}

export function setByte(idx: i32, val: u8): void {
  gridData[idx] = val;
}

export function getEpoch(): i32 {
  return epoch;
}

export function incrementEpochManual(): void {
  epoch++;
}

export function getWasEpochCompleted(): i32 {
  return wasEpochCompleted;
}

export function clearWasEpochCompleted(): void {
  wasEpochCompleted = 0;
}

export function getLastEpochComplexity(): f64 {
  return lastEpochComplexity;
}

export function getLastEpochCopies(): f64 {
  return lastEpochCopies;
}

export function getLastEpochEffectiveCopies(): f64 {
  return lastEpochEffectiveCopies;
}

export function getPrngState(): u32 {
  return prngState;
}

export function setPrngState(state: u32): void {
  prngState = state;
}

function execute(tape: Uint8Array): void {
  let head0: i32 = 0;
  let head1: i32 = 0;
  let ip: i32 = 0;
  let cycles: i32 = 0;
  let complexity: i32 = 0;
  let copies: i32 = 0;
  let neighborWrites: i32 = 0;

  const len = tapeSize * 2;
  const mask = len - 1;
  const neighborThreshold = tapeSize;
  const limit = instructionLimit;

  // Pre-calculate Jump Table - set JS/JNZ jump points
  for (let i = 0; i < len; i++) {
    jumpTable[i] = -1;
  }

  while (cycles < limit) {
    const currentIp = ip & mask;
    const instr = tape[currentIp];
    let isValidOp = true;

    switch (instr) {
      case CMD_LEFT:
        head0 = (head0 - 1) & mask;
        break;
      case CMD_RIGHT:
        head0 = (head0 + 1) & mask;
        break;
      case CMD_H1_DEC:
        head1 = (head1 - 1) & mask;
        break;
      case CMD_H1_INC:
        head1 = (head1 + 1) & mask;
        break;
      case CMD_DEC: {
        const h = head0 & mask;
        tape[h] = u8((i32(tape[h]) - 1) & 255);
        break;
      }
      case CMD_INC: {
        const h = head0 & mask;
        tape[h] = u8((i32(tape[h]) + 1) & 255);
        break;
      }
      case CMD_COPY_0_TO_1: { // .
        const h1 = head1 & mask;
        const h0 = head0 & mask;
        tape[h1] = tape[h0];
        copies++;
        if (h1 >= neighborThreshold) {
          neighborWrites++;
        }
        break;
      }
      case CMD_COPY_1_TO_0: { // ,
        const h0 = head0 & mask;
        const h1 = head1 & mask;
        tape[h0] = tape[h1];
        copies++;
        break;
      }
      case CMD_JZ: { // [
        if (tape[head0 & mask] == 0) {
          let target = i32(jumpTable[currentIp]);
          if (target == -1) {
            // Lazy scan forward
            let depth = 1;
            let scanIp = currentIp + 1;
            let scanned = 0;
            while (depth > 0 && scanned < len) {
              const instr = tape[scanIp & mask];
              if (instr == CMD_JZ) depth++;
              else if (instr == CMD_JNZ) depth--;
              scanIp++;
              scanned++;
            }
            if (depth == 0) {
              target = (scanIp - 1) & mask;
              jumpTable[currentIp] = i16(target);
              jumpTable[target] = i16(currentIp); // Cache reverse link
            } else {
              jumpTable[currentIp] = -2; // Mark as unmatched/invalid
              target = -2;
            }
          }

          if (target >= 0) {
            ip = target;
          } else {
            epochTotalComplexity += f64(complexity);
            epochTotalCopies += f64(copies);
            epochTotalEffectiveCopies += f64(neighborWrites);
            return;
          }
        }
        break;
      }
      case CMD_JNZ: { // ]
        if (tape[head0 & mask] != 0) {
          let target = i32(jumpTable[currentIp]);
          if (target == -1) {
            // Lazy scan backward
            let depth = 1;
            let scanIp = currentIp - 1;
            let scanned = 0;
            while (depth > 0 && scanned < len) {
              const instr = tape[scanIp & mask];
              if (instr == CMD_JNZ) depth++;
              else if (instr == CMD_JZ) depth--;
              scanIp--;
              scanned++;
            }
            if (depth == 0) {
              target = (scanIp + 1) & mask;
              jumpTable[currentIp] = i16(target);
              jumpTable[target] = i16(currentIp); // Cache reverse link
            } else {
              jumpTable[currentIp] = -2; // Mark as unmatched/invalid
              target = -2;
            }
          }

          if (target >= 0) {
            ip = target;
          } else {
            epochTotalComplexity += f64(complexity);
            epochTotalCopies += f64(copies);
            epochTotalEffectiveCopies += f64(neighborWrites);
            return;
          }
        }
        break;
      }
      default:
        isValidOp = false;
        break;
    }

    if (isValidOp) complexity++;
    ip++;
    cycles++;
  }

  epochTotalComplexity += f64(complexity);
  epochTotalCopies += f64(copies);
  epochTotalEffectiveCopies += f64(neighborWrites);
}

export function interact(): void {
  // 1. Pick Agent A (Random)
  const x = i32(rngNext() * f64(gridWidth));
  const y = i32(rngNext() * f64(gridHeight));
  const idxA = (y * gridWidth + x) * tapeSize;

  // 2. Pick Agent B based on Topology
  let nx = 0;
  let ny = 0;

  if (topology == 1) { // global
    do {
      nx = i32(rngNext() * f64(gridWidth));
      ny = i32(rngNext() * f64(gridHeight));
    } while (nx == x && ny == y);
  } else { // spatial
    const dx = i32(rngNext() * 5.0) - 2; // -2 to 2
    const dy = i32(rngNext() * 5.0) - 2; // -2 to 2

    if (dx == 0 && dy == 0) return; // No self-interaction

    nx = (x + dx + gridWidth) % gridWidth;
    ny = (y + dy + gridHeight) % gridHeight;
  }

  const idxB = (ny * gridWidth + nx) * tapeSize;

  // 3. Concatenate Tapes
  for (let i = 0; i < tapeSize; i++) {
    interactionBuffer[i] = gridData[idxA + i];
    interactionBuffer[tapeSize + i] = gridData[idxB + i];
  }

  // 4. Execute
  execute(interactionBuffer);

  epochInteractions++;

  // 5. Split and Update
  for (let i = 0; i < tapeSize; i++) {
    gridData[idxA + i] = interactionBuffer[i];
    gridData[idxB + i] = interactionBuffer[tapeSize + i];
  }

  // Handle epoch boundaries inside WebAssembly
  const epochSize = gridWidth * gridHeight;
  if (epochInteractions >= epochSize) {
    mutate();
    epoch++;
    lastEpochComplexity = epochTotalComplexity / f64(epochSize);
    lastEpochCopies = epochTotalCopies / f64(epochSize);
    lastEpochEffectiveCopies = epochTotalEffectiveCopies / f64(epochSize);
    wasEpochCompleted = 1;

    // Reset counters for next epoch
    epochInteractions = 0;
    epochTotalComplexity = 0.0;
    epochTotalCopies = 0.0;
    epochTotalEffectiveCopies = 0.0;
  }
}

export function step(interactions: i32): void {
  for (let i = 0; i < interactions; i++) {
    interact();
  }
}

export function mutate(): void {
  if (mutationRate <= 0.0) return;

  const totalBytes = gridWidth * gridHeight * tapeSize;
  const expectedMutations = f64(totalBytes) * mutationRate;

  let numMutations = i32(expectedMutations);
  if (rngNext() < (expectedMutations - f64(numMutations))) {
    numMutations++;
  }

  for (let i = 0; i < numMutations; i++) {
    const idx = i32(rngNext() * f64(totalBytes));
    gridData[idx] = u8(rngNext() * 256.0);
  }
}

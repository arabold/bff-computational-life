# System Architecture - Computational Life (BFF Simulation)

Welcome to the **Computational Life Simulation** architecture documentation. This document outlines the system modules, data pipelines, memory layout, and optimization strategies employed to achieve real-time, high-performance simulation of self-replicating programs inside a sandboxed virtual machine grid.

---

## 1. System Overview

The application is inspired by evolutionary computation concepts and the "Computational Life" publication (Agüera y Arcas et al., 2024). It models a 2D toroidal grid of cells, where each cell contains a sequence of memory bytes representing a "genome" or program written in **BFF** (Brainfuck Extended/Flexible), an extension of the classic Brainfuck programming language. 

The application architecture consists of three core components:

```
+--------------------------------------------------------+
|                      UI / React                        |
|   (App.tsx, Sidebar, Control Panels, Gene Inspector)   |
+--------------------------------------------------------+
                           |
                           v
+--------------------------------------------------------+
|                  WebGL Visualizer                      |
|         (SimulationCanvas.tsx - WebGL Fragment)        |
+--------------------------------------------------------+
                           |   Fetches raw state
                           v
+--------------------------------------------------------+
|              WASM / AssemblyScript VM                  |
|    - assembly/simulation.ts -> public/simulation.wasm  |
|    - services/bffSimulation.ts (TS Bridge Layer)       |
+--------------------------------------------------------+
                           |   Code Analysis & Explainers
                           v
+--------------------------------------------------------+
|                    Gemini Pro API                      |
|      (Computational Biologist Insights Provider)       |
+--------------------------------------------------------+
```

---

## 2. Low-Level Execution Engine: BFF Virtual Machine

### Memory Layout
All cell tape data in the grid is stored consecutively in an flattened, contiguous, one-dimensional `Uint8Array` in linear memory.
* For a grid of size $W \times H$ and a tape structure of size $T$:
$$\text{Total Bytes} = W \times H \times T$$
* **Toroidal Adjacency**: Grid bounds wrap safely in both directions (left-right, top-bottom) to enforce continuous boundaries.

### WebAssembly Engine (AssemblyScript)
* **WASM Core (`assembly/simulation.ts`)**: The entire step-by-step virtual machine simulation runs inside WebAssembly for unmatched execution speed. Writing the CPU cycles in AssemblyScript allows up to $\approx 50\times$ more interactions per frame compared to native JS.
* **C Import Environment**: Initializes with an environmental import block configured to handle memory operations safely:
  ```ts
  const importObject = {
    env: {
      abort: (message: number, fileName: number, line: number, column: number) => {
        console.error(`Wasm aborted...`);
      },
      seed: () => Math.random()
    }
  };
  ```

### Key Performance Optimizations

1. **Lazy Jump Table-Caching (O(1) Loops)**:
   * To execute loop instructions (`[` and `]`) efficiently without scanning forward or backward through tape instructions over and over again, the engine utilizes a pre-allocated `jumpTable` of matching addresses (`i16` signatures per instruction index).
   * **Lazy Evaluation**: Jumps are evaluated lazily on the first visit of the bracket in any instruction line, caching both forward and backward positions. It bypasses any expensive full tape compilation runs during simulation setups.
2. **WebGL Dynamic Raw Texture Syncing**:
   * The renderer transfers the grid's raw state bytes directly to the GPU as a single-channel `LUMINANCE` texture.
   * **Conditional Upload Guards**: Texture transfers (`gl.texImage2D`) are skipped when the simulation is paused and there are no active configuration, seeding, or interaction state changes.
3. **Decoupled Grid Statistics & Strided Sampling**:
   * Calculating Shannon Entropy and species population statistics requires iterating over the grid. Doing this every single tick creates massive main-thread latency.
   * To counter this, statistical measures use **Strided Sampling (10% slice)**, and population censuses are throttled to execute every $50$ completed epochs.

---

## 3. Front-End and Visualization

### WebGL Shader Pipeline
* **Fragment Shader (`SimulationCanvas.tsx`)**: The color rendering is offloaded entirely to GPUs via custom WebGL shaders.
* **Palette Texture Lookup**: A static 1D color palette texture (mapping instruction categories like `MOVE`, `MATH`, `COPY`, `LOOP` to specific high-contrast color bands) is pre-uploaded to GPU memory. Global shader indices decode active program steps directly in GPU register calls, reducing rendering Overhead to null.

### AI Biological Report Engine
* **Interactions API Layer (`services/geminiService.ts`)**: Harnesses server-side Gemini 3.5 & 3.1 LLM models.
* **Roleplaying Interpreter**: Implemented with System Instructions configured as a Computational Biologist. Analyzes genome bytes, translates standard BFF loops into abstract operational concepts, evaluates replica behaviors, and compiles a comprehensive scientific report reflecting historic evolutionary statistics.

---

## 4. Development Workflow & Commands

* **Compile WebAssembly Binary**:
  ```bash
  npx asc assembly/simulation.ts --target release -o public/simulation.wasm
  ```
* **Verify Types & Code Compilation**:
  ```bash
  npm run lint
  npm run build
  ```

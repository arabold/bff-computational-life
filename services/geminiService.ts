import { GoogleGenAI, Content } from "@google/genai";
import { BFFSimulation, CMD_LEFT, CMD_RIGHT, CMD_H1_DEC, CMD_H1_INC, CMD_DEC, CMD_INC, CMD_COPY_0_TO_1, CMD_COPY_1_TO_0, CMD_JZ, CMD_JNZ } from "./bffSimulation";
import { SimulationConfig, SimulationStats } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- SHARED CONTEXT & TERMINOLOGY ---
const SCIENTIFIC_CONTEXT = `
You are the lead researcher analyzing the "BFF" (Brainfuck-derivative) artificial life simulation, based on the paper "Computational Life" by Agüera y Arcas et al. (2024).
Your goal is to provide scientific, insightful, and consistent analysis using the paper's terminology.

**Simulation Physics:**
- **Environment:** A 2D toroidal grid (Spatial Topology) or Primordial Soup (Global Topology).
- **Substrate:** Programs are linear tapes of memory executing instructions.
- **Interaction:** Pairwise. Program A executes code on the concatenated tape A+B.
- **Replication:** Success is defined by copying instructions from one tape segment to the other (overwriting the neighbor).
- **Operators (BFF Language):**
  - \`<\` \`>\`: Move Head 0 (Instruction/Read Pointer).
  - \`{\` \`}\`: Move Head 1 (Write Pointer).
  - \`.\`: Copy [Head 0] -> [Head 1] (The replication operator).
  - \`[\` \`]\`: Loops (Jumps based on zero/non-zero).
  - \`+\` \`-\`: Arithmetic (Increment/Decrement).
  - \`0\` (0x00): **Terminator / Null**. Acts as a wall for execution flow. \`[\` jumps forward to match if value is 0.

**Terminology Guide (STRICT):**
1. **Genesis:** The initial state of high-entropy random noise (Uniform distribution).
2. **State Transition:** A critical event where the number of unique tokens/genomes drops rapidly, marking the emergence of dominant self-replicators.
3. **Crystallization:** (Replaces "Orange Goo"). A low-entropy state where trivial, repetitive replicators (often short loops or just \`.\` \`.\` \`.\`) take over. The grid appears ordered but lacks complexity.
4. **Zero-Poisoning:** A failure mode where flawed replicators flood the environment with \`0\`s (Zero Density > 50%), causing replication to stagnate because loops terminate prematurely.
5. **Self-Replicator (SR):** A program capable of copying its own instructions to a neighbor.
   - **Trivial Replicator:** Simple, low-complexity copying (e.g., identity function).
   - **Viable Replicator:** A robust program that successfully writes to the neighbor's memory space (Distance > 64).
6. **Parasite:** An organism that relies on the execution cycles or code of others to replicate.

**Metrics:**
- **Entropy (Shannon):** Measures disorder. High (~8.0) = Random. Low (<1.0) = Crystallized.
- **Zero Density:** % of grid cells that are 0x00. Spikes indicate Zero-Poisoning.
`;

// Helper to map byte to char
const byteToChar = (byte: number) => {
    switch(byte) {
        case 0: return '0'; // Explicit 0 for LLM
        case CMD_LEFT: return '<';
        case CMD_RIGHT: return '>';
        case CMD_H1_DEC: return '{';
        case CMD_H1_INC: return '}';
        case CMD_DEC: return '-';
        case CMD_INC: return '+';
        case CMD_COPY_0_TO_1: return '.';
        case CMD_COPY_1_TO_0: return ',';
        case CMD_JZ: return '[';
        case CMD_JNZ: return ']';
        default: return '·';
    }
};

export const explainOrganismCode = async (genome: Uint8Array): Promise<string> => {
  if (!process.env.API_KEY) {
      return `<div class="p-2 bg-red-900/30 border border-red-500/50 rounded text-red-200 text-xs">
          <strong>Error:</strong> API Key missing.
      </div>`;
  }

  const codeStr = Array.from(genome).map(byteToChar).join('');
  const entropy = BFFSimulation.calculateGenomeEntropy(genome);

  const prompt = `
  ${SCIENTIFIC_CONTEXT}
  
  **Subject Analysis:**
  - **Genome:** \`${codeStr}\`
  - **Shannon Entropy:** ${entropy.toFixed(2)}
  
  **Task:**
  Analyze this specific genome. Determine if it is a functional Self-Replicator.
  
  **Required HTML Template (No Markdown):**
  <div class="space-y-2">
    <p><strong>Classification:</strong> <span class="text-cyan-400">[e.g. "Trivial Replicator", "Inert Noise", "Viable Looper", "Parasite"]</span></p>
    
    <p><strong>Mechanism:</strong> [Explain the mechanics. Does it move \`{\` \`}\` pointers? Does it loop \`[\` \`]\`? Does it copy \`.\`?]</p>
    
    <p><strong>Viability:</strong> [Does it overwrite neighbors (Viable) or itself (Narcissistic/Suicidal)?]</p>
  </div>
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    
    let text = response.text || "<p>Analysis failed.</p>";
    return text.replace(/^```html/, '').replace(/^```/, '').replace(/```$/, '');
  } catch (error: any) {
    return `<div class="text-red-400 text-xs">Analysis Error: ${error.message}</div>`;
  }
};

export const analyzeEvolution = async (history: SimulationStats[], currentStats: SimulationStats, config: SimulationConfig): Promise<string> => {
  if (!process.env.API_KEY) return "<p class='text-red-400'>Error: API Key is missing.</p>";

  const latestEpoch = currentStats.epoch;

  // 1. Prepare Historical Data Points
  // Combine history with the current live stats to ensure the timeline reaches "Now"
  const timelineSource = [...history];
  
  // Only push current stats if it's new (not a duplicate of the last history entry)
  if (timelineSource.length === 0 || timelineSource[timelineSource.length - 1].epoch !== currentStats.epoch) {
      timelineSource.push(currentStats);
  }

  const timelineSamples = timelineSource.length > 20 ? timelineSource.slice(timelineSource.length - 20) : timelineSource;

  const timelineStr = timelineSamples.map(h => {
      let censusInfo = "";
      if (h.census) {
         // Show top species info in timeline if available
         censusInfo = ` [Census: TopSpeciesDom=${(h.census.topSpecies[0]?.dominance * 100).toFixed(1)}%]`;
      }
      return `Epoch ${h.epoch}: Entropy=${h.entropy.toFixed(2)}, ZeroDensity=${(h.zeroDensity*100).toFixed(1)}%, ViableRep=${h.effectiveReplication.toFixed(2)}${censusInfo}`;
  }).join('\n');

  // 2. Prepare Ecosystem Census Data
  // Use current census if available, otherwise fallback to the most recent historical census
  // (Census is expensive and usually runs every ~50 epochs)
  let censusData = currentStats.census;
  // Use the specific epoch recorded for the census, or fallback to current
  let censusEpoch = currentStats.lastCensusEpoch || currentStats.epoch;

  if (!censusData) {
      // Find last available census in history
      for (let i = history.length - 1; i >= 0; i--) {
          if (history[i].census) {
              censusData = history[i].census;
              censusEpoch = history[i].epoch;
              break;
          }
      }
  }

  let censusHtml = "Census Pending";
  let topSpeciesList = "N/A";
  
  if (censusData) {
      censusHtml = `Observed Species (Sampled at Epoch ${censusEpoch}): ${censusData.speciesCount}`;
      
      const topSpeciesDescriptions = censusData.topSpecies.map(s => {
          const codeBytes = s.code.split(',').map(Number);
          const codeStr = codeBytes.map(byteToChar).join('');
          return `- Rank ${s.rank} (${(s.dominance * 100).toFixed(1)}%): \`${codeStr}\` (Entropy: ${s.entropy.toFixed(2)})`;
      });
      topSpeciesList = topSpeciesDescriptions.join('\n');
  }

  const prompt = `
  ${SCIENTIFIC_CONTEXT}

  **Current Simulation State (Epoch ${latestEpoch}):**
  - **Topology:** ${config.topology}
  - **Census Data:** ${censusHtml}
  
  **Dominant Ecosystem (Latest Census):**
  ${topSpeciesList}
  
  **Historical Timeline (Significant Events & Snapshots):**
  ${timelineStr}

  **Analysis Task:**
  Generate an "Epoch Report". Identify evolutionary events like "State Transition", "Zero-poisoning", or "Crystallization".
  Analyze the competition between the top species if multiple exist.
  
  **Required HTML Template (No Markdown):**
  
  <h3>Epoch ${latestEpoch} Report</h3>
  
  <div class="mb-6 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
    <strong>TL;DR:</strong> [1-2 sentences summary of the ecosystem state.]
  </div>

  <h4>Evolutionary History</h4>
  <ul class="list-disc pl-4 space-y-2 mb-6">
    <li><strong>[Epoch Range]:</strong> [Event Description based on timeline]</li>
    <li><strong>Epoch ${latestEpoch} (Now):</strong> [Current Status]</li>
  </ul>

  <h4>Dominant Lifeforms</h4>
  <div class="space-y-3">
    <p>
        <strong>Top Species:</strong> [Analyze the code of Rank 1. Is it complex? Is it a loop?]
    </p>
    <p>
        <strong>Biodiversity:</strong> [Comment on the other top species. Are they variants of Rank 1 or distinct competitors?]
    </p>
    <p>
        <strong>System Health:</strong> [Entropy: ${currentStats.entropy.toFixed(2)}]. [Interpret: Random, Crystallized, or Poisoned?]
    </p>
  </div>

  **Rules:**
  - Use <span class="text-green-400"> for positive terms.
  - Use <span class="text-yellow-400"> for warnings.
  - Use <span class="text-red-400"> for failures.
  - **Do not** use backticks for code in the output, use <code> tags.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: {
        systemInstruction: "You are a computational biologist. Output strictly formatted HTML.",
      }
    });

    let text = response.text || "<p>Analysis complete, but no text was returned.</p>";
    return text.replace(/^```html/, '').replace(/^```/, '').replace(/```$/, '');
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return "<p class='text-red-400'>Failed to analyze simulation data. Check API Key or connection.</p>";
  }
};

export const streamChat = async function* (history: Content[], message: string) {
  if (!process.env.API_KEY) {
      yield "Error: API Key is missing.";
      return;
  }

  const chat = ai.chats.create({
    model: 'gemini-3-flash-preview',
    history: history,
    config: {
        systemInstruction: "You are a helpful scientific assistant for a simulation based on the paper 'Computational Life'. You explain concepts clearly.",
    }
  });

  try {
      const result = await chat.sendMessageStream({ message });
      for await (const chunk of result) {
          if (chunk.text) {
              yield chunk.text;
          }
      }
  } catch (error: any) {
      yield `Error: ${error.message}`;
  }
};

export const generateImage = async (prompt: string, size: "1K" | "2K" | "4K"): Promise<string | null> => {
  if (!process.env.API_KEY) return null;

  // We use gemini-3-pro-image-preview because imageSize config is required
  const model = 'gemini-3-pro-image-preview';
  
  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [{ text: prompt }]
      },
      config: {
        imageConfig: {
            aspectRatio: "1:1",
            imageSize: size
        }
      }
    });
    
    // Extract image
    for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
            return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
    }
    return null;

  } catch (e) {
      console.error(e);
      return null;
  }
};
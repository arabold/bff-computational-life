import React, { useState, useEffect, useMemo } from 'react';
import { getByteColor, CMD_LEFT, CMD_RIGHT, CMD_H1_DEC, CMD_H1_INC, CMD_DEC, CMD_INC, CMD_COPY_0_TO_1, CMD_COPY_1_TO_0, CMD_JZ, CMD_JNZ, BFFSimulation } from '../services/bffSimulation';
import { explainOrganismCode } from '../services/geminiService';
import { InstructionLegend } from './InstructionLegend';

interface InspectorPanelProps {
  x: number;
  y: number;
  data: Uint8Array | null;
  onClose: () => void;
}

export const InspectorPanel: React.FC<InspectorPanelProps> = ({ x, y, data, onClose }) => {
  const [explanation, setExplanation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);

  // Monitor Window Width for responsive grid adaptation
  useEffect(() => {
      const handleResize = () => setWindowWidth(window.innerWidth);
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Reset explanation ONLY when coordinates change. 
  useEffect(() => {
    setExplanation(null);
    setLoading(false);
  }, [x, y]);

  // Calculate Entropy for current cell
  const entropy = useMemo(() => {
      if (!data) return 0;
      return BFFSimulation.calculateGenomeEntropy(data);
  }, [data]);

  if (!data) return null;

  const handleExplain = async () => {
    setLoading(true);
    setExplanation(null); // Clear previous result while loading
    try {
        const result = await explainOrganismCode(data);
        setExplanation(result);
    } catch (e) {
        setExplanation(`<div class="text-red-400">An unexpected error occurred in the UI layer.</div>`);
    } finally {
        setLoading(false);
    }
  };

  // Convert bytes to chars for display
  const getChar = (byte: number) => {
    switch(byte) {
        case 0: return '0'; // Explicit Null/Terminator
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
        default: return '·'; // Inert/Junk
    }
  };

  const isInstruction = (byte: number) => {
     return [CMD_LEFT, CMD_RIGHT, CMD_H1_DEC, CMD_H1_INC, CMD_DEC, CMD_INC, CMD_COPY_0_TO_1, CMD_COPY_1_TO_0, CMD_JZ, CMD_JNZ].includes(byte);
  };

  // Color coding for Entropy badge
  const getEntropyColor = (e: number) => {
      if (e < 1.0) return 'text-yellow-400 bg-yellow-900/30 border-yellow-700/50'; // Crystal/Simple
      if (e < 3.0) return 'text-cyan-400 bg-cyan-900/30 border-cyan-700/50'; // Structured
      return 'text-purple-400 bg-purple-900/30 border-purple-700/50'; // Complex/Random
  };

  const entropyStyle = getEntropyColor(entropy);
  
  // Layout Logic
  const tapeSize = data.length;
  // Calculate ideal square side (e.g. 8 for 64, 16 for 256)
  const idealSide = Math.ceil(Math.sqrt(tapeSize)); 
  
  // Determine actual columns based on available width
  // If we have enough space (desktop > 640px), use the ideal square side.
  // Otherwise, fallback to 8 columns to ensure cells remain legible on mobile.
  let columns = idealSide;
  
  // Logic: 
  // - If tape is small (8x8), it fits everywhere.
  // - If tape is large (16x16), it needs ~500px width.
  //   If window < 640px (Tailwind sm), force 8 columns (wrapping to 32 rows).
  if (idealSide > 8 && windowWidth < 640) {
      columns = 8;
  }

  return (
    <div className="absolute top-4 right-4 z-20 w-min max-w-[calc(100vw-2rem)] bg-black/90 backdrop-blur-md border border-gray-700 rounded-lg shadow-2xl overflow-hidden animate-fade-in max-h-[85vh] flex flex-col transition-all duration-300">
        
        {/* Header */}
        <div className="flex justify-between items-center p-3 bg-gray-800 border-b border-gray-700 shrink-0 sticky top-0 z-10 min-w-[260px]">
            <div>
                <h3 className="text-sm font-bold text-white">Organism Inspector</h3>
                <p className="text-xs text-cyan-400 font-mono">Coords: ({x}, {y})</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
            </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto custom-scrollbar">
            
            {/* Visual Grid with Overlay */}
            <div className="mb-4">
                 <div className="flex justify-between items-end mb-1">
                    <label className="text-[10px] text-gray-500 uppercase font-bold block">Genome ({tapeSize}B)</label>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${entropyStyle}`}>
                        Entropy: {entropy.toFixed(2)}
                    </span>
                 </div>

                {/* Dynamic Grid */}
                <div 
                    className="grid gap-0.5 bg-gray-900 border border-gray-800 p-1 justify-center"
                    style={{ 
                        gridTemplateColumns: `repeat(${columns}, auto)` 
                    }}
                >
                    {Array.from(data).map((byte: number, i) => {
                        const color = getByteColor(byte);
                        const char = getChar(byte);
                        const isInstr = isInstruction(byte);
                        const isZero = byte === 0;
                        
                        return (
                            <div 
                                key={i}
                                className={`w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center select-none ${isZero ? 'border border-gray-800/50' : ''}`}
                                style={{ backgroundColor: `rgb(${color.r},${color.g},${color.b})` }}
                                title={`Byte ${i}: ${byte}`}
                            >
                                <span className={`text-xs font-mono drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] ${isInstr ? 'text-white font-bold' : isZero ? 'text-gray-400 font-bold' : 'text-white/30 text-[10px]'}`}>
                                    {char}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* AI Explain Button */}
            <div className="mb-4">
                 {!explanation && !loading && (
                    <button 
                        onClick={handleExplain}
                        className="w-full py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold uppercase tracking-wider rounded shadow-lg transition-all flex items-center justify-center gap-2 group"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 group-hover:scale-110 transition-transform" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                        Explain
                    </button>
                 )}
                 
                 {loading && (
                    <div className="w-full py-3 bg-gray-800/50 rounded flex flex-col items-center justify-center border border-gray-700">
                         <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                         <span className="text-[10px] text-indigo-400 animate-pulse">Analyzing Genome...</span>
                    </div>
                 )}

                 {explanation && (
                    <div className="animate-fade-in bg-indigo-900/20 border border-indigo-500/30 rounded p-3 shadow-inner">
                         <h4 className="text-[10px] text-indigo-400 uppercase font-bold mb-2 flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                            </svg>
                            Gemini Analysis
                         </h4>
                         <div 
                            className="prose prose-invert prose-xs max-w-none font-sans 
                                prose-p:text-indigo-100 prose-p:leading-relaxed prose-p:mb-2
                                prose-strong:text-white
                                prose-code:text-pink-300 prose-code:bg-indigo-900/50 prose-code:px-0.5 prose-code:rounded
                                max-h-40 overflow-y-auto pr-1 break-words"
                            dangerouslySetInnerHTML={{ __html: explanation }}
                         />
                         
                         {/* Option to retry if it looks like an error (simple heuristic) */}
                         {(explanation.includes('Error') || explanation.includes('Failed')) && (
                             <button 
                                onClick={handleExplain}
                                className="mt-2 text-[10px] text-red-300 hover:text-white underline"
                             >
                                Try Again
                             </button>
                         )}
                    </div>
                 )}
            </div>
            
            <div className="p-2 bg-gray-800/50 border border-gray-700/50 rounded">
                 <InstructionLegend compact layout="list" />
            </div>

        </div>
    </div>
  );
};
import React from 'react';
import { InstructionLegend } from './InstructionLegend';

interface InfoModalProps {
  onClose: () => void;
}

export const InfoModal: React.FC<InfoModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6 border-b border-gray-800 pb-4">
          <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500">
            About Computational Life
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-6 text-gray-300 leading-relaxed text-sm sm:text-base font-sans">
          <section>
            <h3 className="text-lg font-bold text-white mb-2 font-mono">The Science</h3>
            <p className="mb-2">
              This simulation implements the findings of the paper <em>"Computational Life: How Well-formed, Self-replicating Programs Emerge from Simple Interaction"</em> (Agüera y Arcas et al., 2024).
            </p>
            <p>
              It demonstrates how a "Primordial Soup" of random instructions can spontaneously undergo a <strong>State Transition</strong> to Life. 
              Using the <strong>BFF</strong> language (a robust Brainfuck derivative), organisms evolve through implicit competition for space and execution time.
            </p>
          </section>

          <section>
             <h3 className="text-lg font-bold text-white mb-2 font-mono">How It Works</h3>
             <p className="mb-2 text-sm text-gray-400">
                The simulation does not have explicit "organisms" moving around. Instead, it follows a strict interaction rule:
             </p>
             <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-300">
                <li>
                    <strong>Selection:</strong> Two adjacent memory tapes (A and B) are chosen.
                </li>
                <li>
                    <strong>Concatenation:</strong> They are joined into a single temporary execution space (A + B).
                </li>
                <li>
                    <strong>Execution:</strong> The code in A is executed. Because the tapes are joined, loops <code>[ ... ]</code> and pointers can cross the boundary from A into B.
                </li>
                <li>
                    <strong>Modification:</strong> If A contains "Copy" instructions, it writes data from itself (Read Head) into B (Write Head).
                </li>
                <li>
                    <strong>Separation:</strong> The tapes are split back apart. If A successfully copied itself into B, B is now a child of A.
                </li>
             </ol>
          </section>

          <section>
             <h3 className="text-lg font-bold text-white mb-2 font-mono">Understanding Metrics</h3>
             <div className="space-y-3 text-sm text-gray-400 bg-gray-800/50 p-3 rounded border border-gray-700">
                  <div>
                      <strong className="text-pink-400 block mb-1">Species Dominance</strong>
                      <p className="mb-2">The percentage of the grid occupied by the most common genetic code. High dominance often indicates a <strong>State Transition</strong> has occurred.</p>
                  </div>
                  <div>
                      <strong className="text-green-400 block mb-1">Avg Complexity</strong>
                      <p className="mb-2">Average number of instructions executed per interaction. Higher values indicate longer-living programs.</p>
                  </div>
                  <div>
                      <strong className="text-purple-400 block mb-1">Global Entropy (Shannon)</strong>
                      <p className="mb-2">Measures disorder. High = Random. Low = <strong>Crystallization</strong> (Ordered structure).</p>
                  </div>
                  <div>
                      <strong className="text-yellow-400 block mb-1">Viable / Total Replications</strong>
                      <p className="mb-2">Percentage of copy operations that successfully write to a neighbor's memory (Distance &gt; 64). High efficiency indicates robust self-replication.</p>
                  </div>
             </div>
          </section>

          <section>
            <h3 className="text-lg font-bold text-white mb-2 font-mono">The Organism (BFF) & Colors</h3>
            <p className="mb-2">
              Organisms interact by concatenating their tapes. Survival depends on copying instructions from the "Read Head" to the "Write Head".
            </p>
            
            <InstructionLegend layout="grid" />
          </section>

          <section>
            <h3 className="text-lg font-bold text-white mb-4 font-mono">What to Look For</h3>
            <div className="space-y-4">
              
              <div className="bg-gray-800/30 p-3 rounded border-l-2 border-cyan-500">
                <h4 className="text-white font-bold mb-1">State Transition</h4>
                <p className="text-sm text-gray-400 mb-2">
                  A sudden event where a single replicator rapidly populates the grid, causing a sharp drop in Entropy.
                </p>
                <p className="text-xs text-gray-500 uppercase tracking-wider font-bold">
                  Visual Signal:
                </p>
                <p className="text-sm text-cyan-200/80">
                  The chaotic "rainbow" noise of the initial soup will abruptly organize into uniform blocks of color as one species takes over.
                </p>
              </div>

              <div className="bg-gray-800/30 p-3 rounded border-l-2 border-yellow-500">
                <h4 className="text-white font-bold mb-1">Crystallization</h4>
                <p className="text-sm text-gray-400 mb-2">
                  A highly ordered, low-entropy state. This often occurs when "Trivial Replicators" (simple, non-complex copiers) dominate the ecosystem.
                </p>
                <p className="text-xs text-gray-500 uppercase tracking-wider font-bold">
                  Visual Signal:
                </p>
                <p className="text-sm text-yellow-200/80">
                  The grid fills with large areas of <span className="text-orange-400 font-bold">Orange</span> (Copy instructions) mixed with static patterns of Red/Blue movement.
                </p>
              </div>

              <div className="bg-gray-800/30 p-3 rounded border-l-2 border-red-500">
                <h4 className="text-white font-bold mb-1">Zero-Poisoning</h4>
                <p className="text-sm text-gray-400 mb-2">
                  A failure mode where flawed replicators accidentally overwrite neighbors with zeros.
                </p>
                <p className="text-xs text-gray-500 uppercase tracking-wider font-bold">
                  Visual Signal:
                </p>
                <p className="text-sm text-red-200/80">
                  Since <code>0</code> acts as a loop terminator, this breaks the structure of active code. The grid becomes predominantly <span className="text-gray-500 font-bold">Black</span> (Inert bytes), resembling a void that consumes active cells.
                </p>
              </div>

            </div>
          </section>
        </div>
        
        <div className="mt-8 pt-4 border-t border-gray-800 text-center">
             <button 
                onClick={onClose}
                className="px-8 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-lg font-bold shadow-lg transition-all transform hover:scale-105"
             >
                Resume Simulation
             </button>
        </div>
      </div>
    </div>
  );
};
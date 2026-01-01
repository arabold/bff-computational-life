import React from 'react';
import { SimulationConfig } from '../types';

interface SettingsModalProps {
  onClose: () => void;
  config: SimulationConfig;
  onConfigChange: (newConfig: SimulationConfig) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose, config, onConfigChange }) => {
  
  const handleMutationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onConfigChange({
      ...config,
      mutationRate: parseFloat(e.target.value)
    });
  };

  const handleEnergyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onConfigChange({
      ...config,
      instructionLimit: parseInt(e.target.value)
    });
  };

  const handleTopologyChange = (type: 'spatial' | 'global') => {
    onConfigChange({
      ...config,
      topology: type
    });
  };

  const handleSeedingChange = (type: 'random' | 'balanced') => {
    onConfigChange({
      ...config,
      seedingMode: type
    });
  };

  const handleTapeSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onConfigChange({
      ...config,
      tapeSize: parseInt(e.target.value)
    });
  };

  const handleGridSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const size = parseInt(e.target.value);
    onConfigChange({
      ...config,
      gridWidth: size,
      gridHeight: size
    });
  };

  const handleSeedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    if (!isNaN(val)) {
        onConfigChange({
            ...config,
            seed: val
        });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-gray-900 border border-cyan-500/30 rounded-xl p-6 w-full max-w-md shadow-2xl overflow-y-auto max-h-[90vh]">
        <div className="flex justify-between items-center mb-6 border-b border-gray-800 pb-4">
          <h2 className="text-xl font-bold text-cyan-400 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Simulation Settings
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            ✕
          </button>
        </div>

        <div className="space-y-6">
          
          {/* Dimensions Section */}
          <div className="bg-gray-800/50 p-3 rounded-lg border border-gray-700">
             <h3 className="text-xs uppercase text-gray-500 font-bold mb-3 tracking-wider">World Dimensions</h3>
             
             <div className="grid grid-cols-2 gap-4">
                <div>
                   <label className="block text-gray-300 text-xs font-bold mb-1">Grid Size (Population)</label>
                   <select 
                      value={config.gridWidth}
                      onChange={handleGridSizeChange}
                      className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-sm text-white focus:border-cyan-500 outline-none"
                   >
                      <option value="32">32x32 (1,024)</option>
                      <option value="64">64x64 (4,096)</option>
                      <option value="128">128x128 (16,384)</option>
                   </select>
                </div>

                <div>
                   <label className="block text-gray-300 text-xs font-bold mb-1">Genome Size (Tape)</label>
                   <select 
                      value={config.tapeSize}
                      onChange={handleTapeSizeChange}
                      className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-sm text-white focus:border-cyan-500 outline-none"
                   >
                      <option value="64">64 Bytes (Standard)</option>
                      <option value="256">256 Bytes (Complex)</option>
                   </select>
                </div>
             </div>
             
             <div className="mt-3">
                 <label className="block text-gray-300 text-xs font-bold mb-1">Simulation Seed</label>
                 <div className="flex gap-2">
                     <input 
                        type="number" 
                        value={config.seed}
                        onChange={handleSeedChange}
                        className="flex-1 bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-sm text-white focus:border-cyan-500 outline-none font-mono"
                     />
                     <button 
                        onClick={() => onConfigChange({...config, seed: Math.floor(Math.random() * 1000000)})}
                        className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-xs text-white border border-gray-600 transition-colors"
                        title="Randomize Seed"
                     >
                        🎲
                     </button>
                 </div>
                 <p className="text-[10px] text-gray-500 mt-1">
                    Deterministic seed for repeatability.
                 </p>
             </div>

             <p className="text-[10px] text-yellow-500/80 mt-2">
               ⚠ Changing dimensions or seed resets the simulation.
             </p>
          </div>

          {/* Physics Section */}
          <div>
             <h3 className="text-xs uppercase text-gray-500 font-bold mb-3 tracking-wider">Physics & Rules</h3>
             
             {/* Instruction Limit */}
             <div className="mb-4">
                <div className="flex justify-between mb-2">
                    <label className="text-gray-300 text-sm font-bold">Execution Limit (Instructions)</label>
                    <span className="text-cyan-400 font-mono text-sm">{config.instructionLimit}</span>
                </div>
                <input
                  type="range"
                  min="1000"
                  max="16384"
                  step="128"
                  value={config.instructionLimit}
                  onChange={handleEnergyChange}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
             </div>

             {/* Background Mutation */}
             <div className="mb-4">
                <div className="flex justify-between mb-2">
                    <label className="text-gray-300 text-sm font-bold">Background Mutation Rate</label>
                    <span className="text-green-400 font-mono text-sm">{(config.mutationRate * 100).toFixed(4)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="0.005"
                  step="0.00001"
                  value={config.mutationRate}
                  onChange={handleMutationChange}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-green-500"
                />
             </div>

             {/* Topology */}
             <div className="mb-4">
                <label className="block text-gray-300 text-sm font-bold mb-2">Interaction Topology</label>
                <div className="grid grid-cols-2 gap-3">
                   <button
                     onClick={() => handleTopologyChange('spatial')}
                     className={`py-2 px-3 rounded-lg border text-sm transition-all ${
                        config.topology === 'spatial'
                        ? 'bg-purple-900/50 border-purple-500 text-purple-200 shadow-[0_0_10px_rgba(168,85,247,0.3)]'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
                     }`}
                   >
                     Spatial Grid
                     <span className="block text-[10px] opacity-70 mt-1">2D Neighbors</span>
                   </button>
                   <button
                     onClick={() => handleTopologyChange('global')}
                     className={`py-2 px-3 rounded-lg border text-sm transition-all ${
                        config.topology === 'global'
                        ? 'bg-purple-900/50 border-purple-500 text-purple-200 shadow-[0_0_10px_rgba(168,85,247,0.3)]'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
                     }`}
                   >
                     Primordial Soup
                     <span className="block text-[10px] opacity-70 mt-1">Global Random Mix</span>
                   </button>
                </div>
             </div>

             {/* Seeding Mode */}
             <div>
                <label className="block text-gray-300 text-sm font-bold mb-2">Initialization Density</label>
                <div className="grid grid-cols-2 gap-3">
                   <button
                     onClick={() => handleSeedingChange('random')}
                     className={`py-2 px-3 rounded-lg border text-sm transition-all ${
                        config.seedingMode === 'random'
                        ? 'bg-blue-900/50 border-blue-500 text-blue-200 shadow-[0_0_10px_rgba(59,130,246,0.3)]'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
                     }`}
                   >
                     Standard (Bytes)
                     <span className="block text-[10px] opacity-70 mt-1">Sparse (0-255)</span>
                   </button>
                   <button
                     onClick={() => handleSeedingChange('balanced')}
                     className={`py-2 px-3 rounded-lg border text-sm transition-all ${
                        config.seedingMode === 'balanced'
                        ? 'bg-blue-900/50 border-blue-500 text-blue-200 shadow-[0_0_10px_rgba(59,130,246,0.3)]'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
                     }`}
                   >
                     Enriched (Ops)
                     <span className="block text-[10px] opacity-70 mt-1">Instruction Heavy</span>
                   </button>
                </div>
                <p className="text-[10px] text-gray-500 mt-2">
                   Controls the initial randomness. 'Enriched' speeds up the First Replicator emergence by ensuring equal probability of brackets and commands. Applies on Reset.
                </p>
             </div>
          </div>

        </div>

        <div className="mt-8 pt-4 border-t border-gray-800 flex justify-end">
             <button 
                onClick={onClose}
                className="px-6 py-2 bg-cyan-700 hover:bg-cyan-600 text-white rounded-lg font-bold text-sm shadow-lg transition-colors"
             >
                Close Settings
             </button>
        </div>
      </div>
    </div>
  );
};
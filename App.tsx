import React, { useState, useMemo, useEffect, useRef } from 'react';
import { SimulationCanvas } from './components/SimulationCanvas';
import { BFFSimulation } from './services/bffSimulation';
import { InfoModal } from './components/InfoModal';
import { AnalysisModal } from './components/AnalysisModal';
import { SettingsModal } from './components/SettingsModal';
import { InspectorPanel } from './components/InspectorPanel';
import { InstructionLegend } from './components/InstructionLegend';
import { analyzeEvolution } from './services/geminiService';
import { SimulationConfig, SimulationStats } from './types';

type PanelMode = 'full' | 'small' | 'hidden';

export const App: React.FC = () => {
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(2000); // Interactions per frame
  const [showInfo, setShowInfo] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  
  // Inspector State
  const [selectedCell, setSelectedCell] = useState<{x: number, y: number} | null>(null);
  const [inspectorData, setInspectorData] = useState<Uint8Array | null>(null);

  // Panel State
  const [panelMode, setPanelMode] = useState<PanelMode>('full');
  
  // Performance Monitoring
  const [measuredEPS, setMeasuredEPS] = useState(0);
  const lastMeasureRef = useRef({ epoch: 0, time: Date.now() });

  // Initial Configuration based on "Computational Life" Paper (Section 2.1)
  const [config, setConfig] = useState<SimulationConfig>({
    gridWidth: 64,
    gridHeight: 64,
    tapeSize: 64,
    mutationRate: 0.00024, // 0.024% background mutation rate
    instructionLimit: 8192, // 2^13 cycles
    topology: 'spatial', // Start with spatial (Section 2.2)
    seedingMode: 'random', // Default: 'random' (Hard/Sparse). Use 'balanced' for rich soup.
    stepsPerFrame: 2000,
    seed: Math.floor(Math.random() * 1000000) // Default random seed
  });
  
  const simulation = useMemo(() => new BFFSimulation(config), []);
  
  // Stats state for UI updates
  const [stats, setStats] = useState<SimulationStats>(simulation.stats);

  const resetPerformanceMonitor = () => {
      lastMeasureRef.current = { epoch: simulation.stats.epoch, time: Date.now() };
      setMeasuredEPS(0);
  };

  const handleConfigChange = (newConfig: SimulationConfig) => {
    setConfig(newConfig);
    simulation.updateConfig(newConfig);
    
    // If we did a hard reset inside simulation (grid change or seed change), update stats immediately
    if (newConfig.gridWidth !== config.gridWidth || newConfig.tapeSize !== config.tapeSize || newConfig.seed !== config.seed) {
        setStats(simulation.stats);
        setAnalysisResult(null);
        setSelectedCell(null); // Clear selection on grid reset
        setInspectorData(null);
        resetPerformanceMonitor();
    }
  };

  const handleReset = () => {
    simulation.reset();
    setStats(simulation.stats);
    setAnalysisResult(null);
    setSelectedCell(null);
    setInspectorData(null);
    resetPerformanceMonitor();
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setShowAnalysis(true);
    const result = await analyzeEvolution(simulation.history, simulation.stats, config);
    setAnalysisResult(result);
    setAnalyzing(false);
  };
  
  const handleCellClick = (x: number, y: number) => {
    setSelectedCell({ x, y });
    // Immediate fetch
    setInspectorData(simulation.getCellAt(x, y));
  };

  useEffect(() => {
    // Reset monitor on mount/remount
    resetPerformanceMonitor();

    const interval = setInterval(() => {
      const now = Date.now();
      const currentStats = simulation.stats;
      const dt = (now - lastMeasureRef.current.time) / 1000; // Delta time in seconds
      
      // Update stats for UI
      setStats({ ...currentStats });

      // Update Inspector Data if cell is selected
      if (selectedCell) {
        setInspectorData(prev => {
             const newData = simulation.getCellAt(selectedCell.x, selectedCell.y);
             // Optimization: Check if byte content actually changed before updating state
             // to prevent unnecessary re-renders of the InspectorPanel
             if (prev && prev.length === newData.length) {
                 let same = true;
                 for(let i=0; i<prev.length; i++) {
                     if (prev[i] !== newData[i]) {
                         same = false;
                         break;
                     }
                 }
                 if (same) return prev; // Return same reference to skip render
             }
             return newData;
        });
      }

      // Calculate Real EPS
      // We buffer this slightly to avoid jumping numbers on very fast refreshes
      if (dt >= 0.5) {
         const dEpoch = currentStats.epoch - lastMeasureRef.current.epoch;
         if (dEpoch >= 0) { // prevent negative spikes if reset happened async
             setMeasuredEPS(dEpoch / dt);
         }
         lastMeasureRef.current = { epoch: currentStats.epoch, time: now };
      }

    }, 250); // Refresh UI 4 times a second
    return () => clearInterval(interval);
  }, [simulation, selectedCell]); 

  const maxReplication = config.instructionLimit; 
  const maxComplexity = config.instructionLimit;
  
  // Use last known census dominance or 0 (Top species dominance)
  const dominance = stats.census && stats.census.topSpecies.length > 0
    ? stats.census.topSpecies[0].dominance * 100 
    : 0;
  
  // Calculate efficiency ratio for the bar (Viable / Total)
  const replicationEfficiency = stats.replicationRate > 0 
      ? (stats.effectiveReplication / stats.replicationRate) * 100 
      : 0;

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden flex flex-col md:flex-row">
      
      {/* HIDDEN MODE: Floating Button */}
      {panelMode === 'hidden' && (
        <button 
          onClick={() => setPanelMode('full')}
          className="absolute top-4 left-4 z-10 bg-black/60 backdrop-blur-md border border-gray-700 text-cyan-400 hover:text-white hover:bg-black/80 p-3 rounded-full shadow-xl transition-all hover:scale-110 group"
          title="Show Controls"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
          </svg>
        </button>
      )}

      {/* SIDEBAR PANEL (Full or Small) */}
      {panelMode !== 'hidden' && (
        <div className={`absolute top-4 left-4 z-10 w-80 bg-black/80 backdrop-blur-md border border-gray-800 rounded-lg p-4 text-white shadow-xl flex flex-col gap-4 transition-all duration-300 ease-in-out ${panelMode === 'full' ? 'max-h-[90vh] overflow-y-auto' : 'max-h-auto overflow-hidden'}`}>
          
          {/* Header & Window Controls */}
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500 mb-1 leading-tight">
                Computational Life
              </h1>
              <p className="text-[10px] text-gray-400 uppercase tracking-widest flex items-center gap-2">
                BFF Simulation 
                <span 
                    className="normal-case tracking-normal px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-500 font-mono select-all cursor-pointer hover:bg-gray-700 hover:text-cyan-400 transition-colors" 
                    title="Copy Seed to Clipboard" 
                    onClick={() => navigator.clipboard.writeText(config.seed.toString())}
                >
                    #{config.seed}
                </span>
              </p>
            </div>
            
            <div className="flex gap-1 ml-2">
               {/* Toggle Size */}
               <button 
                 onClick={() => setPanelMode(panelMode === 'full' ? 'small' : 'full')}
                 className="text-gray-500 hover:text-cyan-400 transition-colors p-1"
                 title={panelMode === 'full' ? "Minimize" : "Expand"}
               >
                 {panelMode === 'full' ? (
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                   </svg>
                 ) : (
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                   </svg>
                 )}
               </button>
               {/* Close/Hide */}
               <button 
                 onClick={() => setPanelMode('hidden')}
                 className="text-gray-500 hover:text-red-400 transition-colors p-1"
                 title="Hide Panel"
               >
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                 </svg>
               </button>
            </div>
          </div>
          
          {/* Stats Panel (Always Visible) */}
          <div className="bg-gray-800/50 rounded p-3 border border-gray-700">
             <div className="flex justify-between items-center mb-2">
               <span className="text-gray-400 text-xs font-bold uppercase tracking-wider">Epoch</span>
               <span className="text-cyan-400 font-mono font-bold text-lg">{stats.epoch}</span>
             </div>
             
             <div className="space-y-3">
                {/* Dominance */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-400">Species Dominance</span>
                      <span className="text-pink-400 font-mono">{dominance.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-gray-700 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-pink-500 h-full transition-all duration-500" style={{ width: `${Math.min(100, dominance)}%` }} />
                  </div>
                </div>

                {/* Complexity */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-400">Avg Complexity</span>
                      <span className="text-green-400 font-mono">{stats.avgComplexity.toFixed(0)}</span>
                  </div>
                  <div className="w-full bg-gray-700 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-green-500 h-full transition-all duration-500" style={{ width: `${Math.min(100, (stats.avgComplexity / maxComplexity) * 100)}%` }} />
                  </div>
                </div>
                
                {/* Entropy (Sole Measure of Order) */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-400">Entropy</span>
                      <span className="text-purple-400 font-mono">{stats.entropy.toFixed(2)}</span>
                  </div>
                  <div className="w-full bg-gray-700 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-purple-500 h-full transition-all duration-500" style={{ width: `${Math.min(100, (stats.entropy / 8) * 100)}%` }} />
                  </div>
                </div>

                {/* Replication Stats */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-400">Viable / Total Replications</span>
                      <span className="text-yellow-400 font-mono">{replicationEfficiency.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-gray-700 h-1.5 rounded-full overflow-hidden">
                      {/* Efficiency Bar (Viable / Total) */}
                      <div 
                        className="bg-yellow-400 h-full transition-all duration-500 shadow-[0_0_10px_rgba(250,204,21,0.5)]" 
                        style={{ width: `${Math.min(100, replicationEfficiency)}%` }} 
                      />
                  </div>
                </div>

             </div>
          </div>

          {/* Pause/Resume (Always Visible, but styled differently in Full) */}
          <div className={`${panelMode === 'full' ? 'flex gap-2' : ''}`}>
              <button
                onClick={() => setRunning(!running)}
                className={`flex-1 py-1.5 rounded text-sm font-semibold transition-all w-full ${
                  running 
                  ? 'bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30' 
                  : 'bg-green-500/20 text-green-400 border border-green-500/50 hover:bg-green-500/30'
                }`}
              >
                {running ? 'Pause' : 'Resume'}
              </button>
              
              {/* Reset is only visible in Full mode for safety and space */}
              {panelMode === 'full' && (
                <button
                  onClick={handleReset}
                  className="px-3 py-1.5 rounded text-sm font-semibold bg-gray-700 text-gray-300 hover:bg-gray-600 border border-gray-600"
                >
                  Reset
                </button>
              )}
          </div>

          {/* FULL MODE ONLY CONTROLS */}
          {panelMode === 'full' && (
            <div className="space-y-4 animate-fade-in">
              
              {/* Quick Settings Access */}
              <div className="flex gap-2 justify-between border-b border-gray-800 pb-2">
                 <button 
                  onClick={() => setShowSettings(true)}
                  className="flex-1 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 py-1.5 rounded border border-gray-700 flex items-center justify-center gap-1 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Config
                </button>
                <button 
                  onClick={() => setShowInfo(true)}
                  className="flex-1 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 py-1.5 rounded border border-gray-700 flex items-center justify-center gap-1 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Info
                </button>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                   <label className="text-xs text-gray-400 uppercase font-bold" title="Interactions calculated per animation frame">Sim Speed</label>
                   <span className="text-xs text-cyan-400 font-mono">{speed} ops</span>
                </div>
                <input
                  type="range"
                  min="100"
                  max="10000"
                  step="100"
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                  className="w-full mt-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
                <div className="text-[10px] text-gray-600 text-right mt-1 font-mono">
                    {measuredEPS.toFixed(1)} epochs/sec
                </div>
              </div>
              
              <div className="text-[10px] text-gray-500 border-t border-gray-800 pt-2">
                 <p className="flex justify-between"><span>Physics:</span> <span className="text-cyan-400">{config.instructionLimit}</span></p>
                 <p className="flex justify-between"><span>Tape:</span> <span className="text-cyan-400">{config.tapeSize} B</span></p>
                 <p className="flex justify-between"><span>Grid:</span> <span className="text-cyan-400">{config.gridWidth}x{config.gridHeight}</span></p>
                 <p className="flex justify-between"><span>Topology:</span> <span className="text-cyan-400 capitalize">{config.topology}</span></p>
              </div>

              <div className="pt-2 border-t border-gray-800">
                 <button 
                    onClick={handleAnalyze}
                    className="w-full py-2 bg-indigo-900/30 hover:bg-indigo-900/50 border border-indigo-500/30 text-indigo-300 rounded text-sm flex items-center justify-center gap-2 transition-colors"
                 >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    Analyze Evolution
                 </button>
              </div>
            
              <div className="mt-auto border-t border-gray-800 pt-2">
                 <InstructionLegend compact layout="list" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Canvas Area */}
      <div className="flex-1 relative h-full w-full bg-gray-900 overflow-hidden">
        {/* We remove aspect-square logic here to allow full screen panning */}
        <div className="w-full h-full">
           <SimulationCanvas 
              simulation={simulation} 
              running={running} 
              speed={speed} 
              onCellClick={handleCellClick}
           />
        </div>
        
        {/* Inspector Panel Overlay */}
        {selectedCell && inspectorData && (
            <InspectorPanel 
                x={selectedCell.x}
                y={selectedCell.y}
                data={inspectorData}
                onClose={() => { setSelectedCell(null); setInspectorData(null); }}
            />
        )}
      </div>

      {/* Modals */}
      {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} config={config} onConfigChange={handleConfigChange} />}
      {showAnalysis && (
        <AnalysisModal 
          onClose={() => setShowAnalysis(false)} 
          content={analysisResult} 
          isLoading={analyzing} 
        />
      )}
    </div>
  );
};
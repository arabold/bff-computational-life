import React, { useState } from 'react';
import { generateImage } from '../services/geminiService';

interface ImageGeneratorProps {
  onClose: () => void;
}

export const ImageGenerator: React.FC<ImageGeneratorProps> = ({ onClose }) => {
  const [prompt, setPrompt] = useState('Abstract digital lifeforms evolving in a neon grid, data visualization style, 8k');
  const [size, setSize] = useState<"1K" | "2K" | "4K">("1K");
  const [loading, setLoading] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setResultUrl(null);
    const url = await generateImage(prompt, size);
    setResultUrl(url);
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-lg shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
             <span className="text-purple-400">⚡</span> Generate Visuals
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-gray-400 text-xs uppercase mb-1">Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full bg-black/50 border border-gray-600 rounded-lg p-3 text-sm text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none h-24"
            />
          </div>

          <div>
             <label className="block text-gray-400 text-xs uppercase mb-1">Size (Quality)</label>
             <div className="flex gap-2">
                {(['1K', '2K', '4K'] as const).map(s => (
                    <button
                        key={s}
                        onClick={() => setSize(s)}
                        className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                            size === s 
                            ? 'bg-purple-600 text-white' 
                            : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                        }`}
                    >
                        {s}
                    </button>
                ))}
             </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={loading}
            className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white py-3 rounded-lg font-bold shadow-lg disabled:opacity-50 flex justify-center items-center gap-2"
          >
            {loading ? (
                <>
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Generating...
                </>
            ) : "Generate"}
          </button>

          {resultUrl && (
            <div className="mt-4 animate-fade-in">
              <p className="text-gray-400 text-xs mb-2 text-center">Generated Result:</p>
              <img src={resultUrl} alt="Generated" className="w-full rounded-lg border border-gray-700" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

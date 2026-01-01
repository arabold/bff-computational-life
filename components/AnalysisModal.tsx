import React from 'react';

interface AnalysisModalProps {
  onClose: () => void;
  content: string | null;
  isLoading: boolean;
}

export const AnalysisModal: React.FC<AnalysisModalProps> = ({ onClose, content, isLoading }) => {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-gray-900 border border-indigo-500/30 rounded-xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto flex flex-col">
        <div className="flex justify-between items-center mb-6 border-b border-gray-800 pb-4 shrink-0">
          <h2 className="text-xl font-bold text-indigo-400 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
            Evolutionary Analysis
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            ✕
          </button>
        </div>

        <div className="min-h-[200px] text-gray-300 font-sans text-sm leading-relaxed overflow-y-auto">
          {isLoading ? (
             <div className="flex flex-col items-center justify-center h-48 space-y-4">
                <div className="relative w-16 h-16">
                    <div className="absolute inset-0 border-4 border-indigo-900 rounded-full"></div>
                    <div className="absolute inset-0 border-4 border-indigo-500 rounded-full border-t-transparent animate-spin"></div>
                </div>
                <p className="text-indigo-400 animate-pulse">Analyzing Epoch Data...</p>
             </div>
          ) : (
            <div 
              className="prose prose-invert prose-sm max-w-none 
                prose-headings:font-mono prose-headings:text-cyan-400 prose-headings:mb-3
                prose-p:text-gray-300 prose-p:leading-relaxed
                prose-strong:text-white prose-strong:font-bold
                prose-ul:list-disc prose-ul:pl-4 prose-li:text-gray-300 prose-li:marker:text-indigo-500
                prose-table:border-collapse prose-table:w-full prose-table:my-4
                prose-th:border prose-th:border-gray-700 prose-th:p-2 prose-th:text-left prose-th:text-gray-400 prose-th:font-mono prose-th:text-xs prose-th:uppercase
                prose-td:border prose-td:border-gray-700 prose-td:p-2 prose-td:text-gray-300 prose-td:font-mono prose-td:text-xs
                prose-code:text-pink-400 prose-code:bg-gray-800 prose-code:px-1 prose-code:rounded prose-code:before:content-none prose-code:after:content-none"
              dangerouslySetInnerHTML={{ __html: content || "<p>No analysis available.</p>" }}
            />
          )}
        </div>
        
        {!isLoading && (
            <div className="mt-6 pt-4 border-t border-gray-800 text-right shrink-0">
                <button 
                    onClick={onClose}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-sm shadow-lg transition-colors"
                >
                    Close Log
                </button>
            </div>
        )}
      </div>
    </div>
  );
};
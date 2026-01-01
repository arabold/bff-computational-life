import React from 'react';

type LegendLayout = 'list' | 'grid';

interface InstructionLegendProps {
    layout?: LegendLayout;
    compact?: boolean;
}

export const InstructionLegend: React.FC<InstructionLegendProps> = ({ layout = 'list', compact = false }) => {
    // Ordered by importance for life (Replication first)
    const items = [
        { label: 'Copy', symbols: '. ,', color: 'rgb(255, 140, 0)', textColor: 'text-orange-400', desc: 'Replication' },
        { label: 'Move', symbols: '< >', color: 'rgb(255, 60, 60)', textColor: 'text-red-400', desc: 'Head 0' },
        { label: 'Aux', symbols: '{ }', color: 'rgb(60, 120, 255)', textColor: 'text-blue-400', desc: 'Head 1' },
        { label: 'Math', symbols: '+ -', color: 'rgb(60, 255, 60)', textColor: 'text-green-400', desc: 'Arithmetic' },
        { label: 'Loop', symbols: '[ ]', color: 'rgb(180, 50, 255)', textColor: 'text-purple-400', desc: 'Control' },
        { label: 'Null', symbols: '0', color: 'rgb(0, 0, 0)', textColor: 'text-gray-400', desc: 'Terminator' },
    ];

    if (layout === 'grid') {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gray-800 rounded p-4 border border-gray-700 shadow-inner">
                {items.map((item) => (
                    <div key={item.label} className="flex items-center gap-2">
                        <span className={`w-3 h-3 rounded-full inline-block ${item.label === 'Null' ? 'border border-gray-600' : 'shadow-[0_0_5px_rgba(255,255,255,0.3)]'}`} style={{ backgroundColor: item.color }}></span>
                        <span className={`${item.textColor} font-mono font-bold w-8 text-center`}>{item.symbols === '0' ? '0' : item.symbols}</span>
                        <span className="text-gray-300 text-xs sm:text-sm">{item.label} <span className="text-gray-500 text-[10px] uppercase ml-1">({item.desc})</span></span>
                    </div>
                ))}
            </div>
        );
    }

    // List layout (Sidebar/Inspector)
    return (
        <div className={`grid ${compact ? 'grid-cols-2 gap-x-2 gap-y-1' : 'grid-cols-1 gap-1'}`}>
            {items.map((item) => (
                <div key={item.label} className="flex items-center gap-2 text-[10px] font-mono">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${item.label === 'Null' ? 'border border-gray-600' : ''}`} style={{ backgroundColor: item.color }}></span>
                    <span className={`${item.textColor} font-bold`}>{item.symbols === '0' ? '0' : item.symbols}</span>
                    <span className="text-gray-400">{item.label}</span>
                </div>
            ))}
        </div>
    );
};
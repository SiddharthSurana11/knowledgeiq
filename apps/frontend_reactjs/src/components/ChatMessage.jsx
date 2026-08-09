import React from 'react';
import { Bot, User, FileText, ChevronDown, ChevronRight, CheckCircle2, ShieldAlert } from 'lucide-react';
import { cn } from '../lib/utils';
import { Badge } from './ui/badge';
import { Card } from './ui/card';
import logoImg from '../assets/transparent_bg_wolf_2.png';

export default function ChatMessage({ role, text, question, documentHits, resourceType }) {
  const isBot = role === 'bot';

  const formatText = (content) => {
    if (!content) return null;
    return content.split('\n').map((line, idx) => {
      // Basic markdown bold processing
      const boldProcessed = line.split(/(\*\*.*?\*\*)/).map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="text-charcoal-50 font-semibold">{part.slice(2, -2)}</strong>;
        }
        return part;
      });
      return <p key={idx} className="mb-2 last:mb-0 leading-relaxed text-charcoal-200">{boldProcessed}</p>;
    });
  };

  return (
    <div className={cn(
      "w-full py-4 px-4 md:px-6 flex border-b border-charcoal-800/50",
      isBot ? "bg-charcoal-1000" : "bg-charcoal-950/30"
    )}>
      <div className="max-w-4xl mx-auto flex w-full gap-6">
        {/* Avatar */}
        <div className="shrink-0 mt-1">
          {isBot ? (
            <div className="w-8 h-8 rounded bg-[#E2E8F0] p-1 flex items-center justify-center border border-charcoal-700 shadow-2xs">
              <img src={logoImg} alt="AI Avatar" className="w-full h-full object-contain" />
            </div>
          ) : (
            <div className="w-8 h-8 rounded bg-charcoal-800 text-charcoal-300 flex items-center justify-center border border-charcoal-700">
              <User size={18} />
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 min-w-0 space-y-4">
          <div className="prose prose-invert max-w-none">
            {formatText(text)}
          </div>

          {/* Citations / Metadata (Only for Bot) */}
          {isBot && documentHits?.length > 0 && (
            <div className="mt-4 pt-3 border-t border-charcoal-800">
              <div className="flex items-center gap-2 mb-3">
                <FileText size={12} className="text-charcoal-500" />
                <span className="text-[10px] font-bold text-charcoal-500 uppercase tracking-wider">Sources</span>
              </div>
              <div className="flex flex-col gap-2">
                {documentHits.map((doc, idx) => {
                  const isString = typeof doc === 'string';
                  const filename = isString ? doc : doc.filename;
                  const trustScore = isString ? 100 : (doc.trust_score || 100);
                  const chunkIndex = isString ? '-' : doc.chunk_index;
                  const confidence = isString ? '-' : doc.confidence;
                  const category = isString ? 'unknown' : doc.category;
                  const page = isString || !doc.page || doc.page === '-' || doc.page === 'Unknown' ? 'Unknown' : doc.page;
                  
                  return (
                    <details key={idx} className="group bg-charcoal-950/50 border border-charcoal-800 rounded-md overflow-hidden hover:bg-charcoal-900 transition-colors">
                      <summary className="flex items-center justify-between p-2.5 cursor-pointer list-none">
                        <div className="flex items-center gap-3">
                          <ChevronRight size={14} className="text-charcoal-500 group-open:rotate-90 transition-transform" />
                          <span className="text-xs font-medium text-charcoal-200 group-hover:text-teal-400 transition-colors">
                            {filename || 'Unknown Document'}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-charcoal-500">Retrieval Confidence: {confidence}%</span>
                          <Badge 
                            variant={trustScore >= 80 ? 'success' : trustScore >= 60 ? 'warning' : 'destructive'}
                            className="shrink-0 flex items-center gap-1 text-[9px] px-1.5 py-0 h-4"
                          >
                            {trustScore >= 80 ? <CheckCircle2 size={8} /> : <ShieldAlert size={8} />}
                            Trust Score: {trustScore}%
                          </Badge>
                        </div>
                      </summary>
                      <div className="p-3 bg-charcoal-1000/50 border-t border-charcoal-800 text-[11px] text-charcoal-400 flex flex-wrap gap-x-6 gap-y-2">
                        <div><strong className="text-charcoal-500">Chunk:</strong> {chunkIndex}</div>
                        <div><strong className="text-charcoal-500">Category:</strong> {category}</div>
                        {page && page !== 'Unknown' && page !== '-' && page !== 'unknown' && (
                          <div><strong className="text-charcoal-500">Page:</strong> {page}</div>
                        )}
                      </div>
                    </details>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

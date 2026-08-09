import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '../../lib/utils';

export function Dropdown({ value, onChange, options, placeholder = "Select...", className }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') setIsOpen(false);
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setIsOpen(!isOpen);
    }
  };

  const selectedOption = options.find(opt => opt.value === value);

  return (
    <div className={cn("relative", className)} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        className={cn(
          "flex items-center justify-between w-full px-3 py-2 text-sm bg-charcoal-900 border border-charcoal-800 rounded-md shadow-sm transition-all hover:bg-charcoal-800/80 focus:outline-none focus:ring-1 focus:ring-teal-500/50",
          isOpen && "ring-1 ring-teal-500/50 border-teal-500/50"
        )}
      >
        <span className={cn("truncate", !selectedOption && "text-charcoal-400")} title={selectedOption ? selectedOption.label : placeholder}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown size={14} className={cn("text-charcoal-400 transition-transform duration-200 shrink-0 ml-1", isOpen && "rotate-180")} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute z-50 min-w-full w-max max-w-xs md:max-w-md mt-1 bg-charcoal-900 border border-charcoal-800 rounded-md shadow-[0_4px_20px_rgba(0,0,0,0.5)] overflow-hidden left-0"
          >
            <div className="max-h-60 overflow-y-auto p-1">
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  title={option.label}
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "flex items-center justify-between w-full px-2.5 py-2 text-xs rounded-sm text-left transition-colors",
                    value === option.value 
                      ? "bg-teal-500/10 text-teal-400 font-medium" 
                      : "text-charcoal-200 hover:bg-charcoal-800 hover:text-charcoal-50"
                  )}
                >
                  <span className="truncate mr-2">{option.label}</span>
                  {value === option.value && <Check size={14} className="shrink-0" />}
                </button>
              ))}
              {options.length === 0 && (
                <div className="px-2 py-2 text-sm text-charcoal-500 text-center">No options</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

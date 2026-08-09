import React from 'react';
import { cn } from '../../lib/utils';

export function Badge({ className, variant = 'default', children, ...props }) {
  const variants = {
    default: 'bg-charcoal-800 text-charcoal-200 border-transparent',
    success: 'bg-green-500/10 text-green-400 border-green-500/20',
    warning: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    destructive: 'bg-red-500/10 text-red-400 border-red-500/20',
    outline: 'text-charcoal-300 border-charcoal-700',
  };

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2',
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

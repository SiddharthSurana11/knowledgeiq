import React from 'react';
import { cn } from '../../lib/utils';

export function Button({ className, variant = 'primary', size = 'default', children, ...props }) {
  const variants = {
    primary: 'bg-teal-500 text-charcoal-1000 hover:bg-teal-400 font-semibold',
    secondary: 'bg-charcoal-700 text-charcoal-50 hover:bg-charcoal-600',
    outline: 'border border-charcoal-600 text-charcoal-200 hover:bg-charcoal-800 hover:text-charcoal-50',
    ghost: 'text-charcoal-300 hover:text-teal-400 hover:bg-charcoal-800/50',
    danger: 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    default: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
    icon: 'p-2'
  };

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal-500 disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

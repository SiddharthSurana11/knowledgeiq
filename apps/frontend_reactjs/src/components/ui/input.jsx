import React, { forwardRef } from 'react';
import { cn } from '../../lib/utils';

export const Input = forwardRef(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        'flex h-9 w-full rounded-md border border-charcoal-800 bg-charcoal-900 px-3 py-1 text-sm text-charcoal-50 shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-charcoal-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal-500 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = 'Input';

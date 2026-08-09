import React from 'react';
import { cn } from '../../lib/utils';

export function Card({ className, ...props }) {
  return (
    <div
      className={cn(
        'rounded-xl border border-charcoal-800 bg-charcoal-900 shadow-sm text-charcoal-50',
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }) {
  return (
    <div
      className={cn('flex flex-col space-y-1.5 p-6', className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }) {
  return (
    <h3
      className={cn('font-semibold leading-none tracking-tight text-charcoal-50', className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }) {
  return (
    <div className={cn('p-6 pt-0', className)} {...props} />
  );
}

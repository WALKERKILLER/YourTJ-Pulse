import type { InputHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn('h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3.5 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--teal)] focus:ring-2 focus:ring-[color:var(--focus)] placeholder:text-[var(--muted)]', className)}
      {...props}
    />
  );
}

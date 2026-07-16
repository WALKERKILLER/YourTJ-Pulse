import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-[background,color,transform,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-45 active:translate-y-px',
  {
    variants: {
      variant: {
        primary: 'bg-[var(--ink)] text-[var(--paper)] shadow-[0_8px_24px_rgba(29,42,37,.18)] hover:bg-[var(--teal)]',
        secondary: 'border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--surface-strong)]',
        ghost: 'text-[var(--muted)] hover:bg-[var(--surface-strong)] hover:text-[var(--ink)]',
        danger: 'bg-[var(--danger)] text-white hover:brightness-95',
      },
      size: {
        sm: 'h-9 px-3',
        md: 'h-11 px-4',
        icon: 'size-11 p-0',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export function Button({ className, size, variant, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ size, variant }), className)} {...props} />;
}

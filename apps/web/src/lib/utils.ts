import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function displayName(properties: Record<string, unknown>): string {
  for (const key of ['name', 'name:zh', 'name:en', 'ref']) {
    const value = properties[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return '未命名地点';
}

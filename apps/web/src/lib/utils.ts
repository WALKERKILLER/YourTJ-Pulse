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

export function featureIdentity(properties: Record<string, unknown>, sourceId?: string | number, fallback = 'selected'): string {
  for (const value of [properties.stable_id, properties.id, sourceId]) {
    if ((typeof value === 'string' && value.trim()) || typeof value === 'number') return String(value);
  }
  return fallback;
}

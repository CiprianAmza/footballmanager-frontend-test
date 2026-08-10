import { Injectable, Pipe, PipeTransform } from '@angular/core';

export type UiDateValue = Date | string | number | null | undefined;

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normaliseZero(value: number): number {
  return Object.is(value, -0) || Math.abs(value) < 0.000_001 ? 0 : value;
}

export function formatMoney(value: unknown, compact = false, expense = false): string {
  const parsed = finite(value);
  if (parsed === null) return '—';
  const amount = normaliseZero(expense && parsed !== 0 ? -Math.abs(parsed) : parsed);
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'EUR',
    currencyDisplay: 'symbol',
    maximumFractionDigits: 0,
    notation: compact ? 'compact' : 'standard'
  }).format(amount);
}

export function formatPercentage(value: unknown, digits = 0, fraction = false): string {
  const parsed = finite(value);
  if (parsed === null) return '—';
  const percentage = normaliseZero(fraction ? parsed * 100 : parsed);
  return `${new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(percentage)}%`;
}

export function formatRating(value: unknown, digits = 1): string {
  const parsed = finite(value);
  if (parsed === null) return '—';
  return new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(normaliseZero(parsed));
}

export function formatGameDate(value: UiDateValue, withTime = false): string {
  if (value === null || value === undefined || value === '') return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {})
  }).format(date);
}

@Injectable({ providedIn: 'root' })
export class UiFormatService {
  money(value: unknown, compact = false, expense = false): string {
    return formatMoney(value, compact, expense);
  }

  percentage(value: unknown, digits = 0, fraction = false): string {
    return formatPercentage(value, digits, fraction);
  }

  rating(value: unknown, digits = 1): string {
    return formatRating(value, digits);
  }

  date(value: UiDateValue, withTime = false): string {
    return formatGameDate(value, withTime);
  }
}

@Pipe({ name: 'fmMoney' })
export class FmMoneyPipe implements PipeTransform {
  transform(value: unknown, compact = false, expense = false): string {
    return formatMoney(value, compact, expense);
  }
}

@Pipe({ name: 'fmPercent' })
export class FmPercentPipe implements PipeTransform {
  transform(value: unknown, digits = 0, fraction = false): string {
    return formatPercentage(value, digits, fraction);
  }
}

@Pipe({ name: 'fmRating' })
export class FmRatingPipe implements PipeTransform {
  transform(value: unknown, digits = 1): string {
    return formatRating(value, digits);
  }
}

@Pipe({ name: 'fmGameDate' })
export class FmGameDatePipe implements PipeTransform {
  transform(value: UiDateValue, withTime = false): string {
    return formatGameDate(value, withTime);
  }
}

import { formatGameDate, formatMoney, formatPercentage, formatRating, normaliseZero } from './ui-formatters';

describe('UI formatters', () => {
  it('normalises negative zero before display', () => {
    expect(normaliseZero(-0)).toBe(0);
    expect(formatMoney(-0)).toBe('€0');
  });

  it('uses one consistent currency format', () => {
    expect(formatMoney(1250000)).toBe('€1,250,000');
    expect(formatMoney(1250000, true)).toBe('€1M');
    expect(formatMoney(0, false, true)).toBe('€0');
  });

  it('formats percentages and ratings without concatenating them', () => {
    expect(formatPercentage(87.4, 1)).toBe('87.4%');
    expect(formatRating(25.74)).toBe('25.7');
  });

  it('keeps non-date game labels readable', () => {
    expect(formatGameDate('Season 4, Day 2')).toBe('Season 4, Day 2');
  });
});

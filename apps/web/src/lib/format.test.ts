import { describe, expect, it } from 'vitest';
import { formatPrice } from './format';

describe('formatPrice', () => {
  it('drops paise for whole rupees and shows two digits otherwise', () => {
    expect(formatPrice(48000)).toBe('₹480');
    expect(formatPrice(1080)).toBe('₹10.80');
    expect(formatPrice(55080)).toBe('₹550.80');
    expect(formatPrice(12345600)).toBe('₹1,23,456');
  });
});

import { describe, expect, it } from 'vitest';
import { isNewer } from './update';

describe('isNewer', () => {
  it('compares release and dev versions', () => {
    expect(isNewer('0.2.0', '0.1.0')).toBe(true);
    expect(isNewer('0.1.0-dev.2', '0.1.0-dev.1')).toBe(true);
    expect(isNewer('0.1.0', '0.1.0-dev.9')).toBe(true);
    expect(isNewer('0.1.0-dev.9', '0.1.0')).toBe(false);
    expect(isNewer('0.1.0', '0.1.0')).toBe(false);
    expect(isNewer('0.1.10', '0.1.9')).toBe(true);
  });
});

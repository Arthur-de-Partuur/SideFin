import { describe, expect, it } from 'vitest';
import { backupDate, backupName, backupsToRemove, conflicts, isBackupName, showStamp } from './save';

describe('backups', () => {
  it('names a backup folder by local date and time, sortable', () => {
    const name = backupName(new Date(2026, 10, 26, 16, 5, 7));
    expect(name).toBe('2026-11-26 16.05.07');
    expect(isBackupName(name)).toBe(true);
    expect(backupDate(name)?.getTime()).toBe(new Date(2026, 10, 26, 16, 5, 7).getTime());
    expect(isBackupName('my old stuff')).toBe(false);
  });

  it('keeps the last 10, counting the new one, and removes the oldest', () => {
    const names = Array.from({ length: 26 }, (_, i) => backupName(new Date(2026, 10, 1 + i, 12, 0, 0)));
    const gone = backupsToRemove([...names].reverse());
    expect(gone).toHaveLength(17);
    expect(gone[0]).toBe('2026-11-01 12.00.00');
    expect(gone[16]).toBe('2026-11-17 12.00.00');
  });

  it('removes nothing while there is room, and never touches other folders', () => {
    expect(backupsToRemove(['2026-11-01 12.00.00', 'keep me'], 10)).toEqual([]);
    expect(backupsToRemove(['keep me', '2026-11-01 12.00.00', '2026-11-02 12.00.00'], 2)).toEqual(['2026-11-01 12.00.00']);
  });
});

describe('files changed on disk', () => {
  const read = {
    a: { lastModified: 1000, size: 10 },
    b: { lastModified: 1000, size: 10 },
    c: { lastModified: 1000, size: 10 },
    d: undefined,
  };
  it('finds a newer time, another size, a removed file and a file that appeared', () => {
    const now = {
      a: { lastModified: 1000, size: 10 },
      b: { lastModified: 2000, size: 10 },
      c: undefined,
      d: { lastModified: 3000, size: 5 },
    };
    expect(conflicts(['a', 'b', 'c', 'd', 'e'], read, now).map((c) => c.path)).toEqual(['b', 'c', 'd']);
    expect(conflicts(['a'], read, { a: { lastModified: 1000, size: 11 } })).toHaveLength(1);
  });

  it('shows a stamp as time and size', () => {
    const today = new Date(2026, 10, 26, 18, 0);
    expect(showStamp({ lastModified: new Date(2026, 10, 26, 16, 5).getTime(), size: 2431 }, today)).toBe('16:05, 2,431 bytes');
    expect(showStamp(undefined)).toBe('not there');
  });
});

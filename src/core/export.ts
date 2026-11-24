// Files SideFin hands you: a zip of presets and a CSV of the table.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of data) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A zip file (stored, not compressed) holding the given text files. Paths use forward slashes. */
export function zip(files: { path: string; text: string }[], date = new Date()): Uint8Array {
  const enc = new TextEncoder();
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.path);
    const data = enc.encode(f.text);
    const crc = crc32(data);
    const head = (sig: number, central: boolean) => {
      const b = new DataView(new ArrayBuffer(central ? 46 : 30));
      let i = 0;
      const u32 = (v: number) => (b.setUint32(i, v, true), (i += 4));
      const u16 = (v: number) => (b.setUint16(i, v, true), (i += 2));
      u32(sig);
      if (central) u16(20); // made by
      u16(20); // version needed
      u16(0x0800); // UTF-8 names
      u16(0); // stored
      u16(time);
      u16(day);
      u32(crc);
      u32(data.length);
      u32(data.length);
      u16(name.length);
      u16(0); // extra
      if (central) {
        u16(0); // comment
        u16(0); // disk
        u16(0); // internal attributes
        u32(0); // external attributes
        u32(offset);
      }
      return new Uint8Array(b.buffer);
    };
    const local = concat([head(0x04034b50, false), name, data]);
    centrals.push(concat([head(0x02014b50, true), name]));
    locals.push(local);
    offset += local.length;
  }
  const central = concat(centrals);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, central.length, true);
  end.setUint32(16, offset, true);
  return concat([...locals, central, new Uint8Array(end.buffer)]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) {
    out.set(p, i);
    i += p.length;
  }
  return out;
}

/** CSV with a header row, quoted where needed, with a byte order mark so Excel reads it as UTF-8. */
export function csv(rows: string[][]): string {
  const cell = (v: string) => (/[",\n\r;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

import { describe, expect, it } from 'vitest';
import { changedKeys, checkItem, checkItems, clearValue, obsoleteKeys, orcaJson, setValue } from './edit';
import { csv, zip } from './export';
import { baseline } from './fixtures/baseline';
import type { SettingDef } from './types';

const def = (type: string, more: Partial<SettingDef> = {}): SettingDef => ({ key: 'x', type, mode: 'simple', ...more });

describe('checkItem', () => {
  it('accepts values Orca accepts, in the form Orca stores', () => {
    expect(checkItem(def('coInt', { min: 0 }), ' 3 ')).toEqual({ value: '3' });
    expect(checkItem(def('coFloats'), '0.45')).toEqual({ value: '0.45' });
    expect(checkItem(def('coPercent'), '15')).toEqual({ value: '15%' });
    expect(checkItem(def('coFloatOrPercent'), '110%')).toEqual({ value: '110%' });
    expect(checkItem(def('coBools'), '1')).toEqual({ value: '1' });
    expect(checkItem(def('coEnum', { enumValues: ['a', 'b'] }), 'b')).toEqual({ value: 'b' });
    expect(checkItem(def('coPoints'), '0x300')).toEqual({ value: '0x300' });
    expect(checkItem(def('coPoint'), '0, 5')).toEqual({ value: '0,5' });
    expect(checkItem(def('coStrings'), 'G28\n')).toEqual({ value: 'G28\n' });
    expect(checkItem(def('coFloats', { nullable: true }), 'nil')).toEqual({ value: 'nil' });
  });

  it("refuses wrong types and values outside Orca's limits", () => {
    expect(checkItem(def('coInt'), '2.5')).toHaveProperty('error');
    expect(checkItem(def('coFloat'), '0,4')).toHaveProperty('error');
    expect(checkItem(def('coFloat', { max: 2 }), '3')).toEqual({ error: 'The highest value Orca allows is 2.' });
    expect(checkItem(def('coPercent', { max: 100 }), '120%')).toHaveProperty('error');
    expect(checkItem(def('coEnum', { enumValues: ['a'] }), 'c')).toHaveProperty('error');
    expect(checkItem(def('coFloat'), 'nil')).toHaveProperty('error');
  });

  it('names the item that is wrong', () => {
    expect(checkItems(def('coInts'), ['1', 'x'])).toMatchObject({ index: 1 });
    expect(checkItems(def('coInts'), ['1', '2'])).toEqual({ items: ['1', '2'] });
  });
});

describe('setValue and clearValue', () => {
  const p = { name: 'P', inherits: 'Q', a: '1', list: ['1', '1'] };
  it('keeps the shape of the value', () => {
    expect(setValue(p, 'a', ['2'], '1').a).toBe('2');
    expect(setValue(p, 'list', ['3', '3'], ['1', '1']).list).toEqual(['3', '3']);
    expect(setValue(p, 'new', ['5'], ['0']).new).toEqual(['5']);
  });
  it('replaces only the variant of the printer in a per-variant list', () => {
    const r = setValue(p, 'flow', ['0.9'], ['0.97'], { full: ['0.97', '0.89', '0.89'], index: 0, width: 1 });
    expect(r.flow).toEqual(['0.9', '0.89', '0.89']);
    const pair = setValue(p, 'acc', ['5', '6'], ['1', '2'], { full: ['1', '2', '3', '4'], index: 1, width: 2 });
    expect(pair.acc).toEqual(['1', '2', '5', '6']);
  });
  it('removes the own value', () => {
    expect(clearValue(p, 'a')).not.toHaveProperty('a');
    expect(changedKeys(p, clearValue(setValue(p, 'b', ['1'], undefined), 'a'))).toEqual(['a', 'b']);
  });
});

describe('writing presets', () => {
  it('writes keys sorted with four spaces, and can drop keys', () => {
    expect(orcaJson({ name: 'P', b: '1', a: ['2'] }, ['b'])).toBe('{\n    "a": [\n        "2"\n    ],\n    "name": "P"\n}\n');
  });
  it('finds settings this Orca version does not know', () => {
    expect(obsoleteKeys(baseline, { name: 'P', inherits: 'Q', layer_height: '0.2', max_fan_speed: '100' })).toEqual(['max_fan_speed']);
  });
  it('makes a zip with the files', () => {
    const z = zip([{ path: 'a/b.json', text: '{}' }]);
    expect([...z.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(new TextDecoder().decode(z)).toContain('a/b.json');
  });
  it('quotes CSV cells where needed', () => {
    expect(csv([['a', 'b,c'], ['say "hi"', 'x\ny']])).toBe('﻿a,"b,c"\r\n"say ""hi""","x\ny"\r\n');
  });
});

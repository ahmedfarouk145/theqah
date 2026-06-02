import { describe, it, expect } from 'vitest';
import { pickStoreUid } from './resolveStoreUid';

describe('pickStoreUid (precedence)', () => {
  it('prefers an existing users/{uid} mapping above everything', () => {
    expect(pickStoreUid({
      mappedStoreUid: 'salla:1',
      ownerUidStoreUid: 'salla:2',
      emailMatchedStoreUids: ['salla:3'],
    })).toBe('salla:1');
  });

  it('falls back to a store whose ownerUid == uid', () => {
    expect(pickStoreUid({
      mappedStoreUid: null,
      ownerUidStoreUid: 'salla:2',
      emailMatchedStoreUids: ['salla:3'],
    })).toBe('salla:2');
  });

  it('falls back to a unique email match', () => {
    expect(pickStoreUid({
      mappedStoreUid: null,
      ownerUidStoreUid: null,
      emailMatchedStoreUids: ['salla:3'],
    })).toBe('salla:3');
  });

  it('returns null when the email matches MORE than one store (never guess)', () => {
    expect(pickStoreUid({
      mappedStoreUid: null,
      ownerUidStoreUid: null,
      emailMatchedStoreUids: ['salla:3', 'salla:4'],
    })).toBeNull();
  });

  it('returns null when nothing resolves', () => {
    expect(pickStoreUid({
      mappedStoreUid: null,
      ownerUidStoreUid: null,
      emailMatchedStoreUids: [],
    })).toBeNull();
  });

  it('de-dupes identical email matches to a single store (treats as unique)', () => {
    expect(pickStoreUid({
      mappedStoreUid: null,
      ownerUidStoreUid: null,
      emailMatchedStoreUids: ['salla:3', 'salla:3'],
    })).toBe('salla:3');
  });
});

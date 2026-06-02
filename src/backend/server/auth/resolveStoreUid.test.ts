import { describe, it, expect } from 'vitest';
import { pickStoreUid, emailFallbackAllowed } from './resolveStoreUid';

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

describe('emailFallbackAllowed (account-takeover gate)', () => {
  it('allows the email fallback only when the email is VERIFIED', () => {
    expect(emailFallbackAllowed(true, null)).toBe(true);
  });

  it('BLOCKS the email fallback when the email is unverified (attacker-controllable)', () => {
    // An attacker can sign up with a victim merchant's email and never verify it.
    // Without this gate, the unique-email match would auto-link them to the
    // victim's store → account takeover (IDOR).
    expect(emailFallbackAllowed(false, null)).toBe(false);
  });

  it('does not need the email fallback when an ownerUid match already exists', () => {
    expect(emailFallbackAllowed(true, 'salla:2')).toBe(false);
    expect(emailFallbackAllowed(false, 'salla:2')).toBe(false);
  });
});

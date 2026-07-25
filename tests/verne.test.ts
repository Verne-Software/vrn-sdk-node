import { describe, expect, it } from 'vitest';
import { Clockwork, Gate, Relay, Verne, VerneError } from '../src/index.js';

describe('Verne (unified client)', () => {
  it('throws if no keys provided', () => {
    expect(() => new Verne({})).toThrow(VerneError);
  });

  it('exposes relay when relay key is provided', () => {
    const verne = new Verne({ relay: 'vrn_relay_test_sk_abc' });
    expect(verne.relay).toBeInstanceOf(Relay);
  });

  it('exposes gate when gate key is provided', () => {
    const verne = new Verne({ gate: 'vrn_gate_test_sk_abc' });
    expect(verne.gate).toBeInstanceOf(Gate);
  });

  it('exposes clockwork when clockwork key is provided', () => {
    const verne = new Verne({ clockwork: 'vrn_clockwork_test_sk_abc' });
    expect(verne.clockwork).toBeInstanceOf(Clockwork);
  });

  it('throws VerneError when accessing relay without relay key', () => {
    const verne = new Verne({ gate: 'vrn_gate_test_sk_abc' });
    expect(() => verne.relay).toThrow(VerneError);
  });

  it('throws VerneError when accessing gate without gate key', () => {
    const verne = new Verne({ relay: 'vrn_relay_test_sk_abc' });
    expect(() => verne.gate).toThrow(VerneError);
  });

  it('throws VerneError when accessing clockwork without clockwork key', () => {
    const verne = new Verne({ relay: 'vrn_relay_test_sk_abc' });
    expect(() => verne.clockwork).toThrow(VerneError);
  });

  it('returns the same Relay instance on repeated access (lazy singleton)', () => {
    const verne = new Verne({ relay: 'vrn_relay_test_sk_abc' });
    expect(verne.relay).toBe(verne.relay);
  });

  it('returns the same Gate instance on repeated access (lazy singleton)', () => {
    const verne = new Verne({ gate: 'vrn_gate_test_sk_abc' });
    expect(verne.gate).toBe(verne.gate);
  });

  it('returns the same Clockwork instance on repeated access (lazy singleton)', () => {
    const verne = new Verne({ clockwork: 'vrn_clockwork_test_sk_abc' });
    expect(verne.clockwork).toBe(verne.clockwork);
  });
});

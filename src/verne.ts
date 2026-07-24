import { VerneError } from './core/errors.js';
import type { VerneConfig } from './core/types.js';
import { Gate } from './resources/gate/gate.js';
import { Passepartout } from './resources/passepartout/passepartout.js';
import { Relay } from './resources/relay/relay.js';

export class Verne {
  private readonly config: VerneConfig;
  private _relay?: Relay;
  private _gate?: Gate;
  private _passepartout?: Passepartout;

  constructor(config: VerneConfig) {
    if (!config.relay && !config.gate && !config.passepartout) {
      throw new VerneError(
        'At least one service key (relay, gate, or passepartout) must be provided.',
      );
    }
    this.config = config;
  }

  get relay(): Relay {
    if (!this.config.relay) {
      throw new VerneError(
        'Relay API key not provided. Pass `relay` in the Verne constructor config.',
      );
    }
    this._relay ??= new Relay({
      apiKey: this.config.relay,
      baseUrl: this.config.baseUrl,
      timeoutMs: this.config.timeoutMs,
    });
    return this._relay;
  }

  get gate(): Gate {
    if (!this.config.gate) {
      throw new VerneError(
        'Gate API key not provided. Pass `gate` in the Verne constructor config.',
      );
    }
    this._gate ??= new Gate({
      apiKey: this.config.gate,
      baseUrl: this.config.baseUrl,
      timeoutMs: this.config.timeoutMs,
    });
    return this._gate;
  }

  get passepartout(): Passepartout {
    if (!this.config.passepartout) {
      throw new VerneError(
        'Passepartout API key not provided. Pass `passepartout` in the Verne constructor config.',
      );
    }
    this._passepartout ??= new Passepartout({
      apiKey: this.config.passepartout,
      baseUrl: this.config.baseUrl,
      timeoutMs: this.config.timeoutMs,
    });
    return this._passepartout;
  }
}

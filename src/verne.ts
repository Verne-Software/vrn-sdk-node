import { VerneError } from './core/errors.js';
import type { VerneConfig } from './core/types.js';
import { Clockwork } from './resources/clockwork/clockwork.js';
import { Gate } from './resources/gate/gate.js';
import { Passepartout } from './resources/passepartout/passepartout.js';
import { Relay } from './resources/relay/relay.js';

type ServiceName = 'relay' | 'gate' | 'passepartout' | 'clockwork';

const SERVICE_LABELS: Record<ServiceName, string> = {
  relay: 'Relay',
  gate: 'Gate',
  passepartout: 'Passepartout',
  clockwork: 'Clockwork',
};

/**
 * The unified client. Pass one API key (`apiKey`) and use any service its scopes allow;
 * a call to a service the key has no scope for is refused by the API with `403 forbidden`.
 *
 * @example
 * const verne = new Verne({ apiKey: process.env.VERNE_API_KEY });
 * await verne.gate.organizations.create({ name: 'Acme' });
 */
export class Verne {
  private readonly config: VerneConfig;
  private _relay?: Relay;
  private _gate?: Gate;
  private _passepartout?: Passepartout;
  private _clockwork?: Clockwork;

  constructor(config: VerneConfig) {
    if (
      !config.apiKey &&
      !config.relay &&
      !config.gate &&
      !config.passepartout &&
      !config.clockwork
    ) {
      throw new VerneError(
        'No API key provided. Pass `apiKey` (or a per-service key: relay, gate, passepartout, clockwork).',
      );
    }
    this.config = config;
  }

  get relay(): Relay {
    this._relay ??= new Relay(this.serviceConfig('relay'));
    return this._relay;
  }

  get gate(): Gate {
    this._gate ??= new Gate(this.serviceConfig('gate'));
    return this._gate;
  }

  get passepartout(): Passepartout {
    this._passepartout ??= new Passepartout(this.serviceConfig('passepartout'));
    return this._passepartout;
  }

  get clockwork(): Clockwork {
    this._clockwork ??= new Clockwork(this.serviceConfig('clockwork'));
    return this._clockwork;
  }

  private serviceConfig(service: ServiceName) {
    const apiKey = this.config[service] ?? this.config.apiKey;
    if (!apiKey) {
      throw new VerneError(
        `${SERVICE_LABELS[service]} API key not provided. Pass \`apiKey\` (or \`${service}\`) in the Verne constructor config.`,
      );
    }
    return { apiKey, baseUrl: this.config.baseUrl, timeoutMs: this.config.timeoutMs };
  }
}

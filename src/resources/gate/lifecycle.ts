import { seg } from '../../core/http.js';
import type { HttpClient } from '../../core/http.js';
import type { Paginated, RequestOptions } from '../../core/types.js';
import type {
  LifecycleAction,
  LifecycleRule,
  LifecycleRuleKind,
  LifecycleRuleParamsByKind,
  LifecycleRulePreview,
  LifecycleRules,
  ListLifecycleActionsParams,
  SetLifecycleRuleParams,
} from './types.js';

const rulePath = (kind: LifecycleRuleKind) => `/v1/gate/lifecycle/rules/${seg(kind)}`;

/**
 * Automatic deletion of unconfirmed and inactive accounts, and removal of expired roles —
 * four rules per project, all off until you switch them on. Only `delete_unverified` is
 * in the Free plan; switching on another is `403 plan_required`.
 */
export class LifecycleResource {
  constructor(private readonly http: HttpClient) {}

  /** All four rules of the key's project, set up or not, and the plan. */
  async listRules(options?: RequestOptions): Promise<LifecycleRules> {
    return this.http.get<LifecycleRules>('/v1/gate/lifecycle/rules', options);
  }

  /**
   * Creates, changes, or switches a rule on or off. Leave `params` out to keep the saved
   * settings. Switching off or changing settings cancels what the rule had scheduled.
   *
   * @example
   * await gate.lifecycle.setRule('delete_unverified', {
   *   enabled: true,
   *   params: { delete_after_days: 14, warn_before_days: 3 },
   * });
   */
  async setRule<K extends LifecycleRuleKind>(
    kind: K,
    params: SetLifecycleRuleParams<K>,
    options?: RequestOptions,
  ): Promise<LifecycleRule> {
    const body: Record<string, unknown> = { enabled: params.enabled };
    if (params.params !== undefined) body.params = params.params;
    return this.http.put<LifecycleRule>(rulePath(kind), { body, ...options });
  }

  /** Removes a rule and cancels what it scheduled. Succeeds also when there was none. */
  async deleteRule(kind: LifecycleRuleKind, options?: RequestOptions): Promise<void> {
    return this.http.delete<void>(rulePath(kind), options);
  }

  /**
   * How many people a rule with these settings would affect right now. Writes nothing;
   * works whether or not the rule is on or in your plan. `expire_roles` takes `{}`.
   */
  async previewRule<K extends LifecycleRuleKind>(
    kind: K,
    params: LifecycleRuleParamsByKind[K],
    options?: RequestOptions,
  ): Promise<LifecycleRulePreview> {
    return this.http.post<LifecycleRulePreview>(`${rulePath(kind)}/preview`, {
      body: { params },
      ...options,
    });
  }

  /** What the rules have scheduled and done, oldest first, cursor-paged. */
  async listActions(
    params?: ListLifecycleActionsParams,
    options?: RequestOptions,
  ): Promise<Paginated<LifecycleAction>> {
    return this.http.get<Paginated<LifecycleAction>>('/v1/gate/lifecycle/actions', {
      query: { ...params },
      ...options,
    });
  }
}

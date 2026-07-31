import { ILlmProvider } from './ILlmProvider';

type CircuitState = { failures: number; openUntil: number };

export class CircuitBreakerProvider implements ILlmProvider {
  private static readonly states = new Map<string, CircuitState>();

  constructor(
    private readonly key: string,
    private readonly provider: ILlmProvider,
    private readonly failureThreshold = Number(process.env.CLIPROXY_CIRCUIT_FAILURES || 3),
    private readonly cooldownMs = Number(process.env.CLIPROXY_CIRCUIT_COOLDOWN_MS || 60000),
  ) {}

  static getStatus(key: string) {
    const state = this.states.get(key) || { failures: 0, openUntil: 0 };
    return { failures: state.failures, open: state.openUntil > Date.now(), retryAfterMs: Math.max(0, state.openUntil - Date.now()) };
  }

  async generateContent(prompt: string, modelOverride?: string, systemPrompt?: string): Promise<string> {
    const now = Date.now();
    const state = CircuitBreakerProvider.states.get(this.key) || { failures: 0, openUntil: 0 };
    if (state.openUntil > now) throw new Error(`OAuth AI Gateway circuit is open for ${Math.ceil((state.openUntil - now) / 1000)}s.`);
    try {
      const result = await this.provider.generateContent(prompt, modelOverride, systemPrompt);
      CircuitBreakerProvider.states.set(this.key, { failures: 0, openUntil: 0 });
      return result;
    } catch (error) {
      // Invalid model/input is not an infrastructure outage and must not open
      // the circuit for subsequent valid requests.
      if ((error as any)?.statusCode && (error as any).statusCode < 500) throw error;
      const failures = state.failures + 1;
      CircuitBreakerProvider.states.set(this.key, {
        failures,
        openUntil: failures >= this.failureThreshold ? now + this.cooldownMs : 0,
      });
      throw error;
    }
  }
}

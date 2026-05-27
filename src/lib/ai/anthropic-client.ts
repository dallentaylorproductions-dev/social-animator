import Anthropic from '@anthropic-ai/sdk';

/**
 * Thin wrapper around the Anthropic SDK (v1.47 Lane C — first AI
 * plug-point in the repo). Centralized so future plug-points share
 * one client + one env-var path + one place to swap model / provider.
 *
 * Properties:
 *   - Lazily instantiated. The SDK constructor reads ANTHROPIC_API_KEY
 *     eagerly; deferring keeps non-AI code paths free of the env-var
 *     hard requirement.
 *   - Singleton. The SDK manages an HTTP keep-alive agent internally,
 *     so one instance per process is correct.
 *   - Throws a friendly error on missing key. The route catches +
 *     converts to a calm user-facing fallback rather than 500.
 *
 * Per substrate §5.5 (cost discipline): cheapest sufficient model.
 * Haiku 4.5 is the current Haiku-tier and handles JSON-mode
 * structured outputs reliably for small mapping tasks.
 */

export const COMP_IMPORT_MODEL = 'claude-haiku-4-5-20251001';

let _client: Anthropic | null = null;

export class MissingAnthropicKeyError extends Error {
  constructor() {
    super('ANTHROPIC_API_KEY not configured');
    this.name = 'MissingAnthropicKeyError';
  }
}

export function getAnthropicClient(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new MissingAnthropicKeyError();
  _client = new Anthropic({ apiKey });
  return _client;
}

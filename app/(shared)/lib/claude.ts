import Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/nextjs';
import { SYSTEM_PROMPT } from '@cro/prompts/index';

// Instantiate lazily so missing keys don't crash the module at import time —
// the error surfaces only when an actual API call is made.
function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.startsWith('sk-ant-...')) {
    throw new Error('ANTHROPIC_API_KEY is not set. Add your real key to .env.local.');
  }
  return new Anthropic({ apiKey });
}

export const anthropic = new Proxy({} as Anthropic, {
  get(_target, prop) {
    return (getClient() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export async function generateSection(userPrompt: string, retries = 2): Promise<string> {
  const client = getClient();

  let lastError: Error = new Error('Unknown error');
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const message = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const block = message.content[0];
      if (block.type !== 'text') {
        throw new Error('Unexpected response type from Claude API');
      }
      return block.text;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const isRetryable =
        lastError.message.includes('timeout') ||
        lastError.message.includes('overloaded') ||
        lastError.message.includes('529') ||
        lastError.message.includes('503');
      if (!isRetryable || attempt === retries) break;
      // Wait before retrying: 2s, then 4s
      await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
    }
  }

  // All retries exhausted — report to Sentry with prompt context
  Sentry.captureException(lastError, {
    tags: { component: 'claude_api' },
    extra: {
      prompt_preview: userPrompt.slice(0, 500),
      retries,
    },
  });
  throw lastError;
}

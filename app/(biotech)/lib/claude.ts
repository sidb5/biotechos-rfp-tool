import Anthropic from '@anthropic-ai/sdk';

// Biotech-side Claude client. Uses a separate system prompt from the CRO side.
// Never import from @cro/* here.

const BIOTECH_SYSTEM_PROMPT =
  'You are helping a biotech company manage preclinical CRO engagements. ' +
  'You are precise, scientific, and concise. ' +
  'You never include compound names, mechanisms of action, or disease indications ' +
  'in any outbound content unless explicitly instructed. ' +
  'When returning structured data, always return valid JSON only — no prose, ' +
  'no markdown fences, no explanations outside the JSON object.';

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.startsWith('sk-ant-...')) {
    throw new Error('ANTHROPIC_API_KEY is not set. Add it to .env.local.');
  }
  return new Anthropic({ apiKey });
}

export async function biotechClaude({
  userPrompt,
  maxTokens = 2000,
  systemOverride,
}: {
  userPrompt: string;
  maxTokens?: number;
  systemOverride?: string;
}): Promise<string> {
  const client = getClient();

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens,
    system: systemOverride ?? BIOTECH_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const block = message.content[0];
  if (block.type !== 'text') {
    throw new Error('Unexpected non-text response from Claude API');
  }
  return block.text;
}

/**
 * client.ts
 * -----------------------------------------------------------------------
 * Thin wrapper around the Anthropic SDK for the explanation call.
 *
 * DEPLOYMENT NOTE (open question, flagged to the lead — see AILOG.md):
 * this app makes its own Claude API calls at runtime, and the plan
 * explicitly flags "centrally-paid key baked into the app" vs
 * "bring-your-own-key" as an undecided cost question. This module does
 * NOT bake in an answer: it takes an already-constructed Anthropic
 * client, so it works unchanged whether that client is built from a
 * server-side key (small backend/serverless function) or a user-supplied
 * key from a settings screen. What it must never do is assume
 * `process.env.ANTHROPIC_API_KEY` is safely readable in a browser
 * bundle — this is a Vite frontend, so a hardcoded key here would ship
 * to every client. Whoever wires the actual call site decides that.
 * -----------------------------------------------------------------------
 */

import type Anthropic from '@anthropic-ai/sdk';
import type { BuiltPrompt } from './promptBuilder.ts';

/** Default model for explanation generation — see AILOG.md for rationale. */
export const DEFAULT_EXPLANATION_MODEL = 'claude-sonnet-5';

export interface ClaudeCallResult {
  text: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

export async function callClaudeForExplanation(
  client: Anthropic,
  prompt: BuiltPrompt,
  options: { model?: string } = {},
): Promise<ClaudeCallResult> {
  const model = options.model ?? DEFAULT_EXPLANATION_MODEL;

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high' },
    system: prompt.system,
    messages: [{ role: 'user', content: prompt.user }],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('Claude declined to generate this explanation (safety refusal).');
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude response contained no text block.');
  }

  return {
    text: textBlock.text,
    model: response.model,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}

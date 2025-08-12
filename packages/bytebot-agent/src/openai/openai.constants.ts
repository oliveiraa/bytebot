import { BytebotAgentModel } from 'src/agent/agent.types';

export const OPENAI_MODELS: BytebotAgentModel[] = [
  {
    provider: 'openai',
    name: 'gpt-5',
    title: 'GPT-5',
    contextWindow: 400000,
  },
  {
    provider: 'openai',
    name: 'gpt-5-mini',
    title: 'GPT-5 Mini',
    contextWindow: 400000,
  },
];

export const DEFAULT_MODEL = OPENAI_MODELS[0];

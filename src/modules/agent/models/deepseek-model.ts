export type DeepSeekMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type DeepSeekToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
};

export type DeepSeekChoice = {
  index: number;
  message: {
    role: string;
    content?: string | null;
    tool_calls?: DeepSeekToolCall[];
  };
  finish_reason: string;
};

export type DeepSeekResponseData = {
  id: string;
  object: string;
  choices: DeepSeekChoice[];
};

export type DeepSeekStreamDelta = {
  role?: string;
  content?: string;
};

export type DeepSeekStreamChoice = {
  index: number;
  delta: DeepSeekStreamDelta;
  finish_reason?: string | null;
};

export type DeepSeekStreamChunk = {
  id: string;
  object: string;
  choices: DeepSeekStreamChoice[];
};

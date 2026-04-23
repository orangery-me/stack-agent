export type GeminiRole = 'user' | 'model';

export type GeminiTextPart = {
  text: string;
};

export type GeminiFunctionCall = {
  name: string;
  args?: Record<string, unknown>;
};

export type GeminiResponsePart = {
  text?: string;
  functionCall?: GeminiFunctionCall;
};

export type GeminiContentMessage = {
  role: GeminiRole;
  parts: GeminiTextPart[];
};

export type GeminiFunctionDeclaration = {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
};

export type GeminiSystemInstruction = {
  parts: GeminiTextPart[];
};

export type GeminiCandidate = {
  content?: {
    parts?: GeminiResponsePart[];
  };
};

export type GeminiResponseData = {
  candidates?: GeminiCandidate[];
};

export type OpenAiResponseMessage = {
  role: string;
  content: Array<{
    type: 'text' | 'input_text' | 'output_text';
    text: string;
  }>;
};

export type OpenAiToolMessage = {
  type: 'message';
  role: string;
  status: 'completed';
  content: Array<{
    type: 'input_text' | 'output_text';
    text: string;
  }>;
  phase?: 'final_answer';
};

export type OpenAiFunctionCallItem = {
  type: 'function_call';
  id?: string;
  call_id?: string;
  name: string;
  arguments?: string;
};

export type OpenAiOutputMessageItem = {
  type: 'message';
  content?: Array<{
    type?: string;
    text?: string;
  }>;
};

export type OpenAiResponseData = {
  output?: Array<OpenAiFunctionCallItem | OpenAiOutputMessageItem>;
  output_text?: string;
};

export type OpenAiStreamEvent =
  | {
      type: 'response.output_text.delta';
      delta?: string;
    }
  | {
      type: 'response.completed';
    }
  | {
      type?: string;
      [key: string]: unknown;
    };

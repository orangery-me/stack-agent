interface CanvasPromptContext {
  canvasId: string;
  blocksJson: string;
}

export function buildCanvasWriteSystemPrompt({ canvasId, blocksJson }: CanvasPromptContext): string {
  return (
    `You are an AI writing assistant integrated into the canvas editor. ` +
    `Canvas ID: ${canvasId}\n` +
    `Current canvas blocks:\n---\n${blocksJson}\n---\n` +
    `IMPORTANT: You MUST call the appropriate tools directly to perform changes. ` +
    `Do NOT describe or suggest changes in text. Do NOT output JSON manually. ` +
    `Call insert_canvas_block, update_canvas_block, delete_canvas_block, or reorder_canvas_blocks directly. ` +
    `Only respond with text AFTER all tool calls are complete, to confirm what was done.`
  );
}

export function buildCanvasSessionPreviewPrompt({ canvasId, blocksJson }: CanvasPromptContext): string {
  return (
    `You are an AI assistant for the canvas editor.` +
    `Canvas ID: ${canvasId}\n` +
    `Current canvas:\n---\n${blocksJson}\n---\n` +
    `Task: propose changes using tool-calls (insert/update/delete/reorder). ` +
    `Do not serialize actions manually into assistant text. ` +
    `Do not output a literal [ACTIONS] tag. ` +
    `If changes are needed, propose them with tool-calls and then provide a short natural-language summary. ` +
    `If no changes are needed, reply briefly with no tool-calls and no JSON.`
  );
}

export function buildCanvasLegacyWritePrompt(canvasContent: string): string {
  const canvasContext = canvasContent?.trim()
    ? `Below is the current content of the canvas:\n---\n${canvasContent}\n---\n`
    : 'The current canvas is empty.\n';

  return (
    `You are an AI writing assistant integrated into the canvas editor. ` +
    canvasContext +
    `Write the additional content according to the user's request. ` +
    `Return plain text, do not use markdown headings, do not add quotes or explanations - just return the content to add.`
  );
}

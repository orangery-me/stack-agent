interface CanvasPromptContext {
  canvasId: string;
  blocksJson: string;
}

export function buildCanvasWriteSystemPrompt({ canvasId, blocksJson }: CanvasPromptContext): string {
  return (
    `You are an AI writing assistant integrated into the canvas editor. ` +
    `Canvas ID: ${canvasId}\n` +
    `Current canvas blocks:\n---\n${blocksJson}\n---\n` +
    `Language policy: all user-visible output and all generated canvas text MUST be in English. ` +
    `If the user request or source canvas is in another language, understand it and rewrite the result in natural English. ` +
    `IMPORTANT: You MUST call the appropriate tools directly to perform changes. ` +
    `Do NOT describe or suggest changes in text. Do NOT output JSON manually. ` +
    `Call insert_canvas_block, update_canvas_block, delete_canvas_block, or reorder_canvas_blocks directly. ` +
    `For insert_canvas_block and update_canvas_block, the content argument MUST be English. ` +
    `Only respond with text AFTER all tool calls are complete, to confirm what was done.`
  );
}

export function buildCanvasSessionPreviewPrompt({ canvasId, blocksJson }: CanvasPromptContext): string {
  return (
    `You are an AI assistant for the canvas editor.` +
    `Canvas ID: ${canvasId}\n` +
    `Current canvas:\n---\n${blocksJson}\n---\n` +
    `Language policy: all user-visible output and all proposed canvas text MUST be in English. ` +
    `If the user request or source canvas is in another language, translate the intent and produce natural English edits. ` +
    `Task: propose changes using tool-calls (insert/update/delete/reorder). ` +
    `Do not serialize actions manually into assistant text. ` +
    `Do not output a literal [ACTIONS] tag. ` +
    `For insert_canvas_block and update_canvas_block, the content argument MUST be English. ` +
    `If changes are needed, propose them with tool-calls and then provide a short natural-language summary. ` +
    `If no changes are needed, reply briefly with no tool-calls and no JSON.`
  );
}

export function buildCanvasSummaryPrompt({ canvasId, blocksJson }: CanvasPromptContext): string {
  return (
    `You are an AI assistant summarizing a canvas for a workspace user.\n` +
    `Canvas ID: ${canvasId}\n` +
    `Current canvas:\n---\n${blocksJson}\n---\n` +
    `Language policy: the entire response MUST be in English. If the canvas uses another language, summarize it in English.\n` +
    `Return a concise, structured English summary. Include these sections when relevant:\n` +
    `1) Key points\n` +
    `2) Decisions\n` +
    `3) Action items\n` +
    `4) Risks or open questions\n` +
    `Do not propose canvas edits. Do not call tools. Do not output JSON. ` +
    `If the canvas is empty, say that there is no content to summarize.`
  );
}

export function buildCanvasLegacyWritePrompt(canvasContent: string): string {
  const canvasContext = canvasContent?.trim()
    ? `Below is the current content of the canvas:\n---\n${canvasContent}\n---\n`
    : 'The current canvas is empty.\n';

  return (
    `You are an AI writing assistant integrated into the canvas editor. ` +
    canvasContext +
    `Language policy: the returned canvas content MUST be in English. If the user request or source canvas is in another language, translate the intent and write natural English. ` +
    `Write the additional content according to the user's request. ` +
    `Return plain text, do not use markdown headings, do not add quotes or explanations - just return the content to add.`
  );
}

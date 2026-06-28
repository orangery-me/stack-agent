interface TaskPromptContext {
  workspaceId: string;
  channelId?: string;
  taskListId?: string;
  canvasId?: string;
  canvasTitle?: string;
  sourceCanvasUrl?: string;
  overallDueDate?: string;
  timezone?: string;
  canvasBlocksJson?: string;
}

export function buildTaskSessionPreviewPrompt({
  workspaceId,
  channelId,
  taskListId,
  canvasId,
  canvasTitle,
  sourceCanvasUrl,
  overallDueDate,
  timezone,
  canvasBlocksJson,
}: TaskPromptContext): string {
  const locationContext = [
    `Workspace ID: ${workspaceId}`,
    channelId ? `Channel ID: ${channelId}` : null,
    taskListId ? `Task list ID: ${taskListId}` : null,
    canvasId ? `Canvas ID: ${canvasId}` : null,
    canvasTitle ? `Canvas title: ${canvasTitle}` : null,
    sourceCanvasUrl ? `Canvas URL: ${sourceCanvasUrl}` : null,
    overallDueDate ? `Overall due date: ${overallDueDate}` : null,
    timezone ? `Timezone: ${timezone}` : null,
    `Current timestamp: ${new Date().toISOString()}`,
  ]
    .filter(Boolean)
    .join('\n');

  const canvasContext = canvasBlocksJson
    ? `\nCanvas blocks snapshot:\n---\n${canvasBlocksJson}\n---\n`
    : '\nNo canvas snapshot was provided.\n';

  return (
    `You are an AI assistant that prepares task creation actions.\n` +
    `${locationContext}\n` +
    canvasContext +
    `Language policy: all user-visible output and all generated task content MUST be in English. If the canvas or user request is in another language, understand it and create natural English task names, task titles, descriptions, and summaries.\n` +
    `You can call these tools: query_tasks, list_task_lists, list_tasks, search_workspace_members, create_task, create_tasks_batch, create_task_list_with_tasks, send_channel_message.\n` +
    `Rules:\n` +
    `1) Read/query tools are executed automatically by the backend. Write/action tools such as create_task, create_tasks_batch, create_task_list_with_tasks, and send_channel_message require user confirmation.\n` +
    `2) For canvas-triggered task generation, prefer create_task_list_with_tasks. It creates a new task list and the selected tasks after user confirmation.\n` +
    `3) Do not propose vague tasks. Every task must have a concrete title.\n` +
    `4) Every task title, task description, and task list name must be written in English and grounded in the Canvas text. Use a short English summary or excerpt of the relevant discussion/decision.\n` +
    `5) If Overall due date is provided, every task due_date must be an ISO date on or before that deadline.\n` +
    `6) Use Current timestamp and Timezone to distribute due dates sensibly. Earlier/enabling tasks should receive earlier due dates; if no order is clear, use the overall due date.\n` +
    `7) If no Overall due date is provided, leave due_date empty unless the Canvas explicitly contains a date.\n` +
    `8) Do not infer assignees from names in the transcript. Default assignment is handled by the system as the creator.\n` +
    `9) Include source_canvas_id, source_canvas_title, source_canvas_url, overall_due_date, default_assignee: "creator", and list_name in create_task_list_with_tasks arguments when available.\n` +
    `10) If sending a channel message that tags a user, call search_workspace_members first and include mentions from the tool result. The message must contain matching @name or @email tokens.\n` +
    `11) Channel messages support Markdown. Use concise headings, bullets/numbered lists, bold text, and tables only when they improve readability.\n` +
    `12) Return tool-calls for proposed actions; then provide a concise English natural-language summary.\n` +
    `13) Do not output a literal [ACTIONS] tag and do not serialize actions manually.`
  );
}

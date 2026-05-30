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
    `You can propose these tools: create_task, create_tasks_batch, create_task_list_with_tasks, list_task_lists, search_workspace_members.\n` +
    `Rules:\n` +
    `1) For canvas-triggered task generation, prefer create_task_list_with_tasks. It creates a new task list and the selected tasks after user confirmation.\n` +
    `2) Do not propose vague tasks. Every task must have a concrete title.\n` +
    `3) Every task description must be grounded in the Canvas text. Use a short summary or excerpt of the relevant discussion/decision.\n` +
    `4) If Overall due date is provided, every task due_date must be an ISO date on or before that deadline.\n` +
    `5) Use Current timestamp and Timezone to distribute due dates sensibly. Earlier/enabling tasks should receive earlier due dates; if no order is clear, use the overall due date.\n` +
    `6) If no Overall due date is provided, leave due_date empty unless the Canvas explicitly contains a date.\n` +
    `7) Do not infer assignees from names in the transcript. Default assignment is handled by the system as the creator.\n` +
    `8) Include source_canvas_id, source_canvas_title, source_canvas_url, overall_due_date, default_assignee: "creator", and list_name in create_task_list_with_tasks arguments when available.\n` +
    `9) Return tool-calls for proposed actions; then provide a concise natural-language summary.\n` +
    `10) Do not output a literal [ACTIONS] tag and do not serialize actions manually.`
  );
}

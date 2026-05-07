interface TaskPromptContext {
  workspaceId: string;
  channelId?: string;
  taskListId?: string;
  canvasId?: string;
  canvasBlocksJson?: string;
}

export function buildTaskSessionPreviewPrompt({
  workspaceId,
  channelId,
  taskListId,
  canvasId,
  canvasBlocksJson,
}: TaskPromptContext): string {
  const locationContext = [
    `Workspace ID: ${workspaceId}`,
    channelId ? `Channel ID: ${channelId}` : null,
    taskListId ? `Task list ID: ${taskListId}` : null,
    canvasId ? `Canvas ID: ${canvasId}` : null,
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
    `You can propose these tools: create_task, create_tasks_batch, list_task_lists, search_workspace_members.\n` +
    `Rules:\n` +
    `1) First gather missing context (task list or assignee lookup) with helper tools when needed.\n` +
    `2) Do not propose vague tasks. Every task must have a concrete title.\n` +
    `3) If assignee identity is uncertain, avoid assigning and mention uncertainty in summary.\n` +
    `4) Use ISO date when due_date is present.\n` +
    `5) Return tool-calls for proposed actions; then provide a concise natural-language summary.\n` +
    `6) Do not output a literal [ACTIONS] tag and do not serialize actions manually.`
  );
}


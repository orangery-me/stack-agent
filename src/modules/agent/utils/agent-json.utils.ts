export function getJsonObjectCandidates(content: string): string[] {
  const trimmed = content?.trim() ?? '';
  if (!trimmed) return [];

  const candidates = [trimmed];
  const fencePattern = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;

  while ((match = fencePattern.exec(trimmed)) !== null) {
    if (match[1]?.trim()) candidates.push(match[1].trim());
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  return candidates;
}

export function parseJsonObject(content: string): Record<string, unknown> | null {
  for (const candidate of getJsonObjectCandidates(content)) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      continue;
    }
  }

  return null;
}

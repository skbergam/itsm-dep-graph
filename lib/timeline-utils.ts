export function humanizeDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  if (hours < 24) {
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
  
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

export function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export interface AgentUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costUsd?: number;
}

export function formatAgentUsage(usage: AgentUsage | undefined): string | null {
  if (!usage) return null;
  
  const parts: string[] = [];
  
  if (usage.inputTokens !== undefined || usage.outputTokens !== undefined) {
    const inTokens = usage.inputTokens ?? 0;
    const outTokens = usage.outputTokens ?? 0;
    const total = usage.totalTokens ?? (inTokens + outTokens);
    
    parts.push(`${total.toLocaleString()} tokens`);
    parts.push(`(${inTokens.toLocaleString()} in / ${outTokens.toLocaleString()} out)`);
  }
  
  if (usage.costUsd !== undefined) {
    parts.push(`$${usage.costUsd.toFixed(2)}`);
  }
  
  return parts.length > 0 ? parts.join(' · ') : null;
}

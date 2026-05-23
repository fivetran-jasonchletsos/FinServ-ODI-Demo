// Types for the dbt-wizard live-build playback experience.
// Ported from Healthcare-EPIC-Snowflake-Demo — FinServ edition.

export type AgentId = 'explorer' | 'summary' | 'worker' | 'verification' | 'system';

export interface WizardAgent {
  id: Exclude<AgentId, 'system'>;
  name: string;
  code: string;
  color: string;
  role: string;
  tools: string[];
  sample_input: string;
  responsibilities: string[];
}

export type CodeTarget = 'sql' | 'yaml';

export interface BuildEvent {
  from: AgentId;
  step: number;
  step_label: string;
  body: string;
  side_effect?: string;
  code_target?: CodeTarget;
  code_append?: string;
}

export interface WizardScenario {
  company: string;
  request_id: string;
  requested_by: string;
  requested_at: string;
  timezone_label: string;
  question: string;
  metric_label: string;
  metric_code: string;
  target_schema: string;
  target_model: string;
  target_grain: string;
  upstream_models: { model: string; layer: string; grain: string; description: string }[];
  manual_time_days: string;
  build_room_seconds: number;
}

export function wizardDataUrl(path: string): string {
  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
  return `${base}/data/${path}`;
}

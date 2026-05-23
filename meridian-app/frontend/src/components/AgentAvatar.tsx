// Agent avatar badge for the dbt-wizard live-build playback.
// Ported from Healthcare-EPIC-Snowflake-Demo — FinServ edition.

import type { WizardAgent, AgentId } from './wizardTypes';

interface Props {
  agent?: WizardAgent;
  systemColor?: string;
  active?: boolean;
  size?: number;
  from?: AgentId;
}

export default function AgentAvatar({ agent, systemColor = '#0d9488', active = false, size = 40, from }: Props) {
  const color = agent?.color ?? systemColor;
  const code = agent?.code ?? (from === 'system' ? 'SYS' : '??');

  return (
    <span
      className="wizard-agent-avatar"
      data-active={active ? 'true' : undefined}
      style={{
        color,
        height: size,
        width: size,
        minWidth: size,
        fontSize: Math.max(11, size * 0.36),
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 4,
        background: 'rgba(11,39,68,0.45)',
        border: `1.5px solid ${active ? color : 'rgba(11,39,68,0.7)'}`,
        fontFamily: '"JetBrains Mono", monospace',
        fontWeight: 700,
        letterSpacing: '0.05em',
        transition: 'all 200ms ease',
        boxShadow: active ? `0 0 0 2px ${color}, 0 0 14px ${color}66` : undefined,
        flexShrink: 0,
      }}
      title={agent?.name ?? 'System'}
    >
      {code}
    </span>
  );
}

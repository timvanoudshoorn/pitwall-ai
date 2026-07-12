import { CheckCircle2, AlertTriangle, AlertOctagon, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';

export type StatusLevel = 'good' | 'warning' | 'serious' | 'critical';

const STATUS_CONFIG: Record<StatusLevel, { color: string; Icon: typeof CheckCircle2 }> = {
  good: { color: 'var(--color-status-good)', Icon: CheckCircle2 },
  warning: { color: 'var(--color-status-warning)', Icon: AlertTriangle },
  serious: { color: 'var(--color-status-serious)', Icon: AlertOctagon },
  critical: { color: 'var(--color-status-critical)', Icon: XCircle },
};

interface StatusBadgeProps {
  level: StatusLevel;
  children: ReactNode;
}

/** Status is reserved and always icon + label — never color alone. */
export function StatusBadge({ level, children }: StatusBadgeProps) {
  const { color, Icon } = STATUS_CONFIG[level];
  return (
    <span
      className="pit-clip-sm inline-flex items-center gap-1.5 border px-2 py-0.5 text-xs font-medium"
      style={{
        color,
        borderColor: `color-mix(in oklab, ${color} 45%, transparent)`,
        background: `color-mix(in oklab, ${color} 12%, transparent)`,
        boxShadow: `0 0 8px -3px color-mix(in oklab, ${color} 70%, transparent)`,
      }}
    >
      <Icon size={13} strokeWidth={2.5} />
      {children}
    </span>
  );
}

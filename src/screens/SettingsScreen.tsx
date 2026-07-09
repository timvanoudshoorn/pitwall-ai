import { Panel } from '../components/ui/Panel';

export function SettingsScreen() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <Panel eyebrow="Settings" title="Display">
        <SettingRow label="Units" value="Metric (km, °C)" />
        <SettingRow label="Time format" value="Seconds, tabular digits" />
      </Panel>

      <Panel eyebrow="Settings" title="AI Explanation">
        <SettingRow label="API access" value="Not yet configured — pending centrally-paid vs bring-your-own-key decision" />
      </Panel>
    </div>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-pit-border py-2.5 text-sm last:border-b-0">
      <span className="text-pit-text-secondary">{label}</span>
      <span className="tabular font-medium text-pit-text">{value}</span>
    </div>
  );
}

import { useState } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { CarClassTrackSelectScreen } from './screens/CarClassTrackSelectScreen';
import { RaceParametersScreen } from './screens/RaceParametersScreen';
import { StrategyComparisonScreen } from './screens/StrategyComparisonScreen';
import { TyreDegradationScreen } from './screens/TyreDegradationScreen';
import { PitWindowScreen } from './screens/PitWindowScreen';
import { AIExplanationScreen } from './screens/AIExplanationScreen';
import { StrategyBattleScreen } from './screens/StrategyBattleScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import type { AppSelection } from './types/session';

const INITIAL_SELECTION: AppSelection = {
  carClassId: 'f1_2025',
  performanceTier: 'contender',
  trackId: 'silverstone',
  raceParameters: {
    raceLengthPct: 100,
    qualifyingFormat: 'full_qualifying',
    weather: 'dry',
    rainProbabilityPct: 15,
  },
};

function App() {
  const [selection, setSelection] = useState<AppSelection>(INITIAL_SELECTION);

  function patchSelection(patch: Partial<AppSelection>) {
    setSelection((prev) => ({ ...prev, ...patch }));
  }

  return (
    <HashRouter>
      <AppShell selection={selection}>
        <Routes>
          <Route path="/" element={<CarClassTrackSelectScreen selection={selection} onChange={patchSelection} />} />
          <Route path="/parameters" element={<RaceParametersScreen selection={selection} onChange={patchSelection} />} />
          <Route path="/comparison" element={<StrategyComparisonScreen selection={selection} />} />
          <Route path="/degradation" element={<TyreDegradationScreen selection={selection} />} />
          <Route path="/pit-window" element={<PitWindowScreen selection={selection} />} />
          <Route path="/explanation" element={<AIExplanationScreen selection={selection} />} />
          <Route path="/battle" element={<StrategyBattleScreen selection={selection} />} />
          <Route path="/settings" element={<SettingsScreen />} />
        </Routes>
      </AppShell>
    </HashRouter>
  );
}

export default App;

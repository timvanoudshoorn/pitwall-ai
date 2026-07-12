import { lazy, Suspense, useState } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { RouteFallback } from './components/layout/RouteFallback';
import { MainMenuScreen } from './screens/MainMenuScreen';
import type { AppSelection } from './types/session';

/**
 * The landing route is now the Main Menu (a real title screen — see
 * MainMenuScreen for why) rather than Car Class & Track Select directly.
 * Every screen except the landing one is lazy-loaded — the production
 * build was tripping Vite's 500KB chunk warning with everything in one
 * bundle, and the landing screen itself needs none of it (no charts, no
 * ai/ prompt-building code, no data-adapter JSON). MainMenuScreen stays a
 * static import so the very first paint has zero waterfall;
 * CarClassTrackSelectScreen moved to `/select` and joined the lazy group
 * since it's no longer the first thing downloaded.
 */
const CarClassTrackSelectScreen = lazy(() =>
  import('./screens/CarClassTrackSelectScreen').then((m) => ({ default: m.CarClassTrackSelectScreen })),
);
const RaceParametersScreen = lazy(() =>
  import('./screens/RaceParametersScreen').then((m) => ({ default: m.RaceParametersScreen })),
);
const StrategyComparisonScreen = lazy(() =>
  import('./screens/StrategyComparisonScreen').then((m) => ({ default: m.StrategyComparisonScreen })),
);
const TyreDegradationScreen = lazy(() =>
  import('./screens/TyreDegradationScreen').then((m) => ({ default: m.TyreDegradationScreen })),
);
const PitWindowScreen = lazy(() =>
  import('./screens/PitWindowScreen').then((m) => ({ default: m.PitWindowScreen })),
);
const AIExplanationScreen = lazy(() =>
  import('./screens/AIExplanationScreen').then((m) => ({ default: m.AIExplanationScreen })),
);
const StrategyBattleScreen = lazy(() =>
  import('./screens/StrategyBattleScreen').then((m) => ({ default: m.StrategyBattleScreen })),
);
const SettingsScreen = lazy(() =>
  import('./screens/SettingsScreen').then((m) => ({ default: m.SettingsScreen })),
);

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
  personalPace: {
    enabled: false,
    lapTimesSec: [],
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
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<MainMenuScreen />} />
            <Route path="/select" element={<CarClassTrackSelectScreen selection={selection} onChange={patchSelection} />} />
            <Route path="/parameters" element={<RaceParametersScreen selection={selection} onChange={patchSelection} />} />
            <Route path="/comparison" element={<StrategyComparisonScreen selection={selection} />} />
            <Route path="/degradation" element={<TyreDegradationScreen selection={selection} />} />
            <Route path="/pit-window" element={<PitWindowScreen selection={selection} />} />
            <Route path="/explanation" element={<AIExplanationScreen selection={selection} />} />
            <Route path="/battle" element={<StrategyBattleScreen selection={selection} />} />
            <Route path="/settings" element={<SettingsScreen selection={selection} onChange={patchSelection} />} />
          </Routes>
        </Suspense>
      </AppShell>
    </HashRouter>
  );
}

export default App;

/**
 * index.ts — barrel export for the sim engine.
 * Consumers (ai, visual) should import from 'src/sim' rather than reaching
 * into individual files, so internal reorganization doesn't break them.
 */

export * from './constants';
export * from './degradation';
export * from './fuel';
export * from './pitStopLoss';
export * from './undercutOvercut';
export * from './strategyCompare';
export * from './safetyCar';
export * from './weather';
export * from './ers';
export * from './performanceTier';

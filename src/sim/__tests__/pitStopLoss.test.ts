import { describe, it, expect } from 'vitest';
import {
  pitStopLoss,
  pitLaneDeltaFromGeometry,
} from '../pitStopLoss';
import { PIT_STOP } from '../constants';

describe('pitStopLoss.ts', () => {
  describe('pitLaneDeltaFromGeometry', () => {
    it('should calculate pit lane delta from geometry', () => {
      // Pit lane: 600m at 60 kph
      // Racing line: same 600m at 300 kph
      const geometry = {
        pitLaneLengthM: 600,
        pitLaneSpeedLimitKph: 60,
        racingLineSpeedKph: 300,
      };
      const delta = pitLaneDeltaFromGeometry(geometry);
      // Pit lane time: (600/1000/60) * 3600 = 36 seconds
      // Racing line time: (600/1000/300) * 3600 = 7.2 seconds
      // Delta: 36 - 7.2 = 28.8 seconds
      expect(delta).toBeCloseTo(28.8, 1);
    });

    it('should handle small pit lane', () => {
      const geometry = {
        pitLaneLengthM: 300,
        pitLaneSpeedLimitKph: 80,
        racingLineSpeedKph: 250,
      };
      const delta = pitLaneDeltaFromGeometry(geometry);
      // Pit lane time: (300/1000/80) * 3600 ≈ 13.5 seconds
      // Racing line time: (300/1000/250) * 3600 ≈ 4.32 seconds
      // Delta: 13.5 - 4.32 ≈ 9.18 seconds
      expect(delta).toBeCloseTo(9.18, 1);
    });

    it('should be positive (pit lane is always slower)', () => {
      const geometry = {
        pitLaneLengthM: 500,
        pitLaneSpeedLimitKph: 100,
        racingLineSpeedKph: 280,
      };
      const delta = pitLaneDeltaFromGeometry(geometry);
      expect(delta).toBeGreaterThan(0);
    });
  });

  describe('pitStopLoss', () => {
    it('should return default values when no overrides supplied', () => {
      const result = pitStopLoss();
      expect(result.pitLaneDeltaSec).toBe(PIT_STOP.defaultPitLaneDeltaSec);
      expect(result.stationaryTimeSec).toBe(PIT_STOP.defaultStationaryTimeSec);
      expect(result.totalPitLossSec).toBe(
        PIT_STOP.defaultPitLaneDeltaSec + PIT_STOP.defaultStationaryTimeSec
      );
    });

    it('should include placeholder flags for defaults', () => {
      const result = pitStopLoss();
      expect(result.assumptionFlags).toContain('pit_lane_delta_generic_placeholder');
      expect(result.assumptionFlags).toContain('pit_stationary_time_placeholder');
    });

    it('should accept custom pit lane delta', () => {
      const result = pitStopLoss({ pitLaneDeltaSec: 20 });
      expect(result.pitLaneDeltaSec).toBe(20);
      // Stationary should still be default
      expect(result.stationaryTimeSec).toBe(PIT_STOP.defaultStationaryTimeSec);
      // Total should be 20 + default stationary
      expect(result.totalPitLossSec).toBe(20 + PIT_STOP.defaultStationaryTimeSec);
    });

    it('should accept custom stationary time', () => {
      const result = pitStopLoss({ stationaryTimeSec: 3.0 });
      expect(result.stationaryTimeSec).toBe(3.0);
      // Pit lane should still be default
      expect(result.pitLaneDeltaSec).toBe(PIT_STOP.defaultPitLaneDeltaSec);
      // Total should be default pit lane + 3.0
      expect(result.totalPitLossSec).toBe(PIT_STOP.defaultPitLaneDeltaSec + 3.0);
    });

    it('should accept both custom pit lane and stationary time', () => {
      const result = pitStopLoss({
        pitLaneDeltaSec: 15,
        stationaryTimeSec: 2.5,
      });
      expect(result.pitLaneDeltaSec).toBe(15);
      expect(result.stationaryTimeSec).toBe(2.5);
      expect(result.totalPitLossSec).toBe(17.5);
    });

    it('should prioritize explicit pitLaneDeltaSec over geometry', () => {
      const geometry = {
        pitLaneLengthM: 600,
        pitLaneSpeedLimitKph: 60,
        racingLineSpeedKph: 300,
      };
      const result = pitStopLoss({
        pitLaneDeltaSec: 20,
        geometry,
      });
      // Should use explicit value, not derived
      expect(result.pitLaneDeltaSec).toBe(20);
    });

    it('should derive pit lane delta from geometry when no explicit delta', () => {
      const geometry = {
        pitLaneLengthM: 600,
        pitLaneSpeedLimitKph: 60,
        racingLineSpeedKph: 300,
      };
      const result = pitStopLoss({ geometry });
      // Should use derived value (28.8 from earlier test)
      expect(result.pitLaneDeltaSec).toBeCloseTo(28.8, 1);
    });

    it('should apply field state factor (safety car)', () => {
      const result = pitStopLoss({
        pitLaneDeltaSec: 20,
        stationaryTimeSec: 2.5,
        fieldStateFactor: 0.6, // VSC reduces pit loss
      });
      // Total should be (20 + 2.5) * 0.6 = 13.5
      expect(result.totalPitLossSec).toBeCloseTo(13.5, 2);
    });

    it('should flag when field state factor is applied', () => {
      const result = pitStopLoss({
        fieldStateFactor: 0.6,
      });
      expect(result.assumptionFlags).toContain('pit_loss_field_state_factor_applied');
    });

    it('should not flag field state factor of 1.0', () => {
      const result = pitStopLoss({
        fieldStateFactor: 1.0,
      });
      expect(result.assumptionFlags).not.toContain('pit_loss_field_state_factor_applied');
    });

    it('should include source confidence flag if not confirmed', () => {
      const result = pitStopLoss({
        pitLaneDeltaSec: 20,
        sourceConfidence: 'reasonable_estimate',
      });
      expect(result.assumptionFlags).toContain('pit_loss_source_confidence_reasonable_estimate');
    });

    it('should not flag source confidence if confirmed', () => {
      const result = pitStopLoss({
        pitLaneDeltaSec: 20,
        sourceConfidence: 'confirmed',
      });
      expect(result.assumptionFlags).not.toContain('pit_loss_source_confidence_confirmed');
    });

    it('should flag placeholder confidence', () => {
      const result = pitStopLoss({
        pitLaneDeltaSec: 20,
        sourceConfidence: 'placeholder',
      });
      expect(result.assumptionFlags).toContain('pit_loss_source_confidence_placeholder');
    });

    it('should round to 3 decimal places', () => {
      const result = pitStopLoss({
        pitLaneDeltaSec: 20.1234,
        stationaryTimeSec: 2.5678,
      });
      // Should be rounded to 3 decimals
      expect(result.pitLaneDeltaSec).toBe(20.123);
      expect(result.stationaryTimeSec).toBe(2.568);
      expect(result.totalPitLossSec).toBe(22.691);
    });
  });
});

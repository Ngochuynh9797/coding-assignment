import { Decimal } from 'decimal.js';
import { UnitConverter } from '@shared/units/unit-converter';
import { WEIGHT_UNITS } from '@shared/units/unit.registry';
import { bestsByGroup, metricsOf, type PrSetInput } from './pr-calculator';

const set = (
  setId: string,
  reps: number,
  weightKg: string | Decimal,
  exerciseId = 1,
  performedOn = '2026-10-12',
): PrSetInput => ({ setId, exerciseId, performedOn, reps, weightKg: new Decimal(weightKg) });

describe('metricsOf', () => {
  it('computes Epley 1RM rounded to 4 decimal places', () => {
    expect(metricsOf(5, new Decimal(100)).e1rmKg.toFixed()).toBe('116.6667');
  });

  it('keeps the Epley formula for a single rep instead of returning the weight', () => {
    expect(metricsOf(1, new Decimal(100)).e1rmKg.toFixed()).toBe('103.3333');
  });

  it('computes volume as weight times reps', () => {
    expect(metricsOf(8, new Decimal('102.0583')).volumeKg.toFixed()).toBe('816.4664');
  });

  it('returns the weight unchanged', () => {
    expect(metricsOf(3, new Decimal('102.0583')).weightKg.toFixed()).toBe('102.0583');
  });
});

describe('bestsByGroup', () => {
  it('returns an empty array for no sets', () => {
    expect(bestsByGroup([])).toEqual([]);
  });

  it('lets the earlier set win a tie between 225 lb and the same weight entered in kg', () => {
    const fromLb = new UnitConverter(WEIGHT_UNITS).toStoredKg(new Decimal(225), 'lb');
    const [best] = bestsByGroup([set('lb-set', 5, fromLb), set('kg-set', 5, '102.0583')]);

    expect(best?.bestWeightSetId).toBe('lb-set');
    expect(best?.bestVolumeSetId).toBe('lb-set');
    expect(best?.bestE1rmSetId).toBe('lb-set');
  });

  it('keeps the first set as best of every metric when two sets are identical', () => {
    const [best] = bestsByGroup([set('first', 5, '100'), set('second', 5, '100')]);

    expect(best).toMatchObject({
      bestWeightSetId: 'first',
      bestVolumeSetId: 'first',
      bestE1rmSetId: 'first',
    });
  });

  it('picks a different winning set per metric', () => {
    const [best] = bestsByGroup([set('heavy', 1, '140'), set('long', 15, '100')]);

    expect(best?.bestWeightKg.toFixed()).toBe('140');
    expect(best?.bestWeightSetId).toBe('heavy');
    expect(best?.bestVolumeKg.toFixed()).toBe('1500');
    expect(best?.bestVolumeSetId).toBe('long');
    expect(best?.bestE1rmKg.toFixed()).toBe('150');
    expect(best?.bestE1rmSetId).toBe('long');
  });

  it('merges two entries of the same exercise on the same day into one group', () => {
    const bests = bestsByGroup([set('morning', 5, '100'), set('evening', 5, '110')]);

    expect(bests).toHaveLength(1);
    expect(bests[0]?.bestWeightSetId).toBe('evening');
  });

  it('sorts groups by exerciseId then performedOn regardless of input order', () => {
    const bests = bestsByGroup([
      set('a', 5, '100', 10, '2026-10-02'),
      set('b', 5, '100', 2, '2026-10-12'),
      set('c', 5, '100', 10, '2026-09-30'),
      set('d', 5, '100', 2, '2026-10-01'),
    ]);

    expect(bests.map((b) => [b.exerciseId, b.performedOn])).toEqual([
      [2, '2026-10-01'],
      [2, '2026-10-12'],
      [10, '2026-09-30'],
      [10, '2026-10-02'],
    ]);
  });

  it('records zero bests for bodyweight sets', () => {
    const [best] = bestsByGroup([set('pull-up', 10, '0')]);

    expect(best?.bestWeightKg.isZero()).toBe(true);
    expect(best?.bestVolumeKg.isZero()).toBe(true);
    expect(best?.bestE1rmKg.isZero()).toBe(true);
    expect(best?.bestWeightSetId).toBe('pull-up');
  });
});

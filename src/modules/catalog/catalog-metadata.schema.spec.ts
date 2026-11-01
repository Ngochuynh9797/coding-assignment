import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCatalogMetadata } from './catalog-metadata.schema';

const validMetadata = {
  muscleGroups: [
    { code: 'chest', name: 'Chest' },
    { code: 'triceps', name: 'Triceps' },
    { code: 'full_body', name: 'Full Body' },
  ],
  exercises: [
    { name: 'Bench Press', muscleGroups: ['chest', 'triceps'] },
    { name: "Farmer's Walk", muscleGroups: [] },
  ],
};

function withExercises(exercises: unknown[]): unknown {
  return { ...validMetadata, exercises };
}

describe('parseCatalogMetadata', () => {
  it('accepts a valid file, including an exercise without muscle groups', () => {
    expect(parseCatalogMetadata(validMetadata)).toEqual(validMetadata);
  });

  it('rejects an exercise that references an unknown muscle group code', () => {
    const raw = withExercises([{ name: 'Bench Press', muscleGroups: ['chest', 'pecs'] }]);

    expect(() => parseCatalogMetadata(raw)).toThrow(
      /exercises\.0\.muscleGroups\.1: .*'Bench Press'.*unknown muscle group 'pecs'/,
    );
  });

  it('rejects two exercises with the same normalized name', () => {
    const raw = withExercises([
      { name: 'Bench Press', muscleGroups: [] },
      { name: 'bench  press', muscleGroups: [] },
    ]);

    expect(() => parseCatalogMetadata(raw)).toThrow(
      /exercises\.1\.name: 'bench {2}press' duplicates 'Bench Press'/,
    );
  });

  it('rejects a muscle group code outside [a-z_]', () => {
    const raw = { ...validMetadata, muscleGroups: [{ code: 'Chest', name: 'Chest' }] };

    expect(() => parseCatalogMetadata(raw)).toThrow(/muscleGroups\.0\.code/);
  });

  it('rejects a duplicate muscle group code', () => {
    const raw = {
      ...validMetadata,
      muscleGroups: [...validMetadata.muscleGroups, { code: 'chest', name: 'Pecs' }],
    };

    expect(() => parseCatalogMetadata(raw)).toThrow(
      /muscleGroups\.3\.code: duplicate muscle group code 'chest'/,
    );
  });

  it('rejects a muscle group listed twice for one exercise', () => {
    const raw = withExercises([{ name: 'Bench Press', muscleGroups: ['chest', 'chest'] }]);

    expect(() => parseCatalogMetadata(raw)).toThrow(
      /exercises\.0\.muscleGroups\.1: .*'chest' is listed more than once/,
    );
  });

  it('rejects a name longer than the 100 characters a log request may send', () => {
    const raw = withExercises([{ name: 'x'.repeat(101), muscleGroups: [] }]);

    expect(() => parseCatalogMetadata(raw)).toThrow(/exercises\.0\.name/);
  });

  it('reports every problem in one error', () => {
    const raw = withExercises([
      { name: 'Bench Press', muscleGroups: ['pecs'] },
      { name: 'BENCH PRESS', muscleGroups: ['lats'] },
    ]);

    expect(() => parseCatalogMetadata(raw)).toThrow(
      /'pecs'[\s\S]*'BENCH PRESS' duplicates[\s\S]*'lats'/,
    );
  });

  it('accepts the shipped config/exercise-metadata.json', () => {
    const path = join(__dirname, '../../../config/exercise-metadata.json');
    const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));

    expect(() => parseCatalogMetadata(raw)).not.toThrow();
  });
});

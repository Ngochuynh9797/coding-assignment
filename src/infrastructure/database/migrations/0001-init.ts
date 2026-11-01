import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Init1793491200000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    await queryRunner.query(`
      CREATE TABLE muscle_groups (
        id   SERIAL PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE exercises (
        id           SERIAL PRIMARY KEY,
        display_name TEXT NOT NULL,
        name_key     TEXT NOT NULL,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT exercises_name_key_uq UNIQUE (name_key)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX exercises_name_key_trgm ON exercises USING GIN (name_key gin_trgm_ops)`,
    );

    await queryRunner.query(`
      CREATE TABLE exercise_muscle_groups (
        exercise_id     INT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
        muscle_group_id INT NOT NULL REFERENCES muscle_groups(id) ON DELETE CASCADE,
        PRIMARY KEY (exercise_id, muscle_group_id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX emg_muscle_group ON exercise_muscle_groups (muscle_group_id, exercise_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE workout_entries (
        id           UUID PRIMARY KEY DEFAULT uuidv7(),
        user_id      TEXT NOT NULL,
        exercise_id  INT  NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
        performed_on DATE NOT NULL,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX entries_user_date ON workout_entries (user_id, performed_on DESC, id DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX entries_user_exercise_date ON workout_entries (user_id, exercise_id, performed_on DESC, id DESC)`,
    );

    await queryRunner.query(`
      CREATE TABLE workout_sets (
        id        UUID PRIMARY KEY DEFAULT uuidv7(),
        entry_id  UUID NOT NULL REFERENCES workout_entries(id) ON DELETE CASCADE,
        set_index SMALLINT NOT NULL,
        reps      INT NOT NULL CHECK (reps > 0),
        weight    NUMERIC(10,4) NOT NULL CHECK (weight >= 0),
        unit      TEXT NOT NULL,
        weight_kg NUMERIC(10,4) NOT NULL CHECK (weight_kg >= 0),
        CONSTRAINT sets_entry UNIQUE (entry_id, set_index)
      )
    `);

    // fillfactor leaves free space in each page so the per-request upserts can be HOT updates.
    await queryRunner.query(`
      CREATE TABLE daily_exercise_bests (
        user_id            TEXT NOT NULL,
        exercise_id        INT  NOT NULL REFERENCES exercises(id),
        performed_on       DATE NOT NULL,
        best_weight_kg     NUMERIC(10,4) NOT NULL,
        best_weight_set_id UUID NOT NULL,
        best_volume_kg     NUMERIC(12,4) NOT NULL,
        best_volume_set_id UUID NOT NULL,
        best_e1rm_kg       NUMERIC(10,4) NOT NULL,
        best_e1rm_set_id   UUID NOT NULL,
        CONSTRAINT daily_bests_pk PRIMARY KEY (user_id, exercise_id, performed_on)
      ) WITH (fillfactor = 90)
    `);

    await queryRunner.query(`
      CREATE TABLE idempotency_keys (
        user_id         TEXT NOT NULL,
        key             TEXT NOT NULL,
        request_hash    TEXT NOT NULL,
        response_status SMALLINT,
        response        JSONB,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, key)
      )
    `);
    await queryRunner.query(`CREATE INDEX idempotency_created_at ON idempotency_keys (created_at)`);
  }

  // pg_trgm is kept: other objects in the same database may depend on it.
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE idempotency_keys`);
    await queryRunner.query(`DROP TABLE daily_exercise_bests`);
    await queryRunner.query(`DROP TABLE workout_sets`);
    await queryRunner.query(`DROP TABLE workout_entries`);
    await queryRunner.query(`DROP TABLE exercise_muscle_groups`);
    await queryRunner.query(`DROP TABLE exercises`);
    await queryRunner.query(`DROP TABLE muscle_groups`);
  }
}

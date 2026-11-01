import type { DataSource, EntityManager } from 'typeorm';
import type { IsolationLevel } from 'typeorm/driver/types/IsolationLevel';

export function runInTransaction<T>(
  dataSource: DataSource,
  fn: (manager: EntityManager) => Promise<T>,
  isolationLevel: IsolationLevel = 'READ COMMITTED',
): Promise<T> {
  return dataSource.transaction(isolationLevel, fn);
}

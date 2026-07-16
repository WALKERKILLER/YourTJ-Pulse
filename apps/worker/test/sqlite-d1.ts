import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';

class SqliteD1Statement {
  private values: SQLInputValue[] = [];

  constructor(private readonly statement: StatementSync) {}

  bind(...values: SQLInputValue[]) {
    this.values = values;
    return this;
  }

  execute() {
    return this.statement.run(...this.values);
  }

  async run() {
    const result = this.execute();
    return { success: true, meta: { changes: Number(result.changes) }, results: [] };
  }

  async first<T>() {
    return (this.statement.get(...this.values) as T | undefined) ?? null;
  }

  async all<T>() {
    return {
      success: true,
      meta: { changes: 0 },
      results: this.statement.all(...this.values) as T[],
    };
  }
}

export interface TestDatabase {
  binding: D1Database;
  close: () => void;
}

export function createTestDatabase(migration: string): TestDatabase {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(migration);
  const database = {
    prepare(sql: string) {
      return new SqliteD1Statement(sqlite.prepare(sql)) as unknown as D1PreparedStatement;
    },
    async batch(statements: D1PreparedStatement[]) {
      sqlite.exec('BEGIN');
      try {
        const results = (statements as unknown as SqliteD1Statement[]).map((statement) => {
          const result = statement.execute();
          return { success: true, meta: { changes: Number(result.changes) }, results: [] };
        });
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
    async exec(sql: string) {
      sqlite.exec(sql);
      return { count: 0, duration: 0 };
    },
  } as unknown as D1Database;
  return { binding: database, close: () => sqlite.close() };
}

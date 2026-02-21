interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results?: T[] }>;
  run(): Promise<{ meta: { last_row_id?: number | null } }>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface R2PutOptions {
  httpMetadata?: {
    contentType?: string;
  };
}

interface R2Bucket {
  put(key: string, value: ArrayBuffer | ArrayBufferView | string | null, options?: R2PutOptions): Promise<void>;
}

import { describe, it, expect } from 'vitest';
import { buildColumnMap, formatColumnInline, ColumnInfo, ModelAnnotation } from './types';

describe('formatColumnInline', () => {
  it('formats a non-nullable string column', () => {
    const col: ColumnInfo = { name: 'email', type: 'string', nullable: false };
    expect(formatColumnInline(col)).toBe('string, not null');
  });

  it('formats a nullable column', () => {
    const col: ColumnInfo = { name: 'bio', type: 'text', nullable: true };
    expect(formatColumnInline(col)).toBe('text, nullable');
  });

  it('includes string default', () => {
    const col: ColumnInfo = { name: 'role', type: 'string', nullable: false, default: 'user' };
    expect(formatColumnInline(col)).toBe('string, not null, default: "user"');
  });

  it('includes numeric default', () => {
    const col: ColumnInfo = { name: 'count', type: 'integer', nullable: false, default: 0 };
    expect(formatColumnInline(col)).toBe('integer, not null, default: 0');
  });

  it('includes boolean false default', () => {
    const col: ColumnInfo = { name: 'active', type: 'boolean', nullable: false, default: false };
    expect(formatColumnInline(col)).toBe('boolean, not null, default: false');
  });

  it('omits null default', () => {
    const col: ColumnInfo = { name: 'deleted_at', type: 'datetime', nullable: true, default: null };
    expect(formatColumnInline(col)).toBe('datetime, nullable');
  });

  it('omits undefined default', () => {
    const col: ColumnInfo = { name: 'id', type: 'integer', nullable: false };
    expect(formatColumnInline(col)).toBe('integer, not null');
  });
});

describe('buildColumnMap', () => {
  it('builds a lookup map from annotation columns', () => {
    const annotation: ModelAnnotation = {
      table_name: 'users',
      primary_key: 'id',
      columns: [
        { name: 'id', type: 'integer', nullable: false },
        { name: 'email', type: 'string', nullable: false },
        { name: 'name', type: 'string', nullable: true },
      ],
      indexes: [],
      associations: [],
    };

    const map = buildColumnMap(annotation);
    expect(map.size).toBe(3);
    expect(map.get('email')?.type).toBe('string');
    expect(map.get('missing')).toBeUndefined();
  });

  it('handles empty columns', () => {
    const annotation: ModelAnnotation = {
      table_name: 'empty',
      primary_key: 'id',
      columns: [],
      indexes: [],
      associations: [],
    };

    const map = buildColumnMap(annotation);
    expect(map.size).toBe(0);
  });
});

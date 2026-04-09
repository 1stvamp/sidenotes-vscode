/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';

let mockRailsRoot = '';

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: () => ({
      get: (key: string, defaultVal: string) => {
        if (key === 'railsRoot') { return mockRailsRoot || defaultVal; }
        return defaultVal;
      },
    }),
  },
  Uri: {
    file: (fsPath: string) => ({ fsPath, toString: () => `file://${fsPath}` }),
  },
}));

// Mock fs.existsSync and fs.readdirSync for auto-detection tests
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof fs>('fs');
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readdirSync: vi.fn(() => []),
  };
});

import { modelToAnnotationPath, annotationToModelPath, extractModelName, clearRailsRootCache } from './fileMapper';

function makeUri(fsPath: string) {
  return { fsPath, toString: () => `file://${fsPath}` };
}

function makeWorkspaceFolder(rootPath: string) {
  return { uri: makeUri(rootPath) } as any;
}

beforeEach(() => {
  mockRailsRoot = '';
  clearRailsRootCache();
  vi.mocked(fs.existsSync).mockReturnValue(false);
  vi.mocked(fs.readdirSync).mockReturnValue([]);
});

describe('modelToAnnotationPath', () => {
  const ws = makeWorkspaceFolder('/project');

  it('maps a model file to its annotation (no auto-detect)', () => {
    const result = modelToAnnotationPath(makeUri('/project/app/models/user.rb') as any, ws);
    expect(result?.fsPath).toBe(path.join('/project', '.annotations', 'user.yml'));
  });

  it('maps a namespaced model', () => {
    const result = modelToAnnotationPath(makeUri('/project/app/models/admin/setting.rb') as any, ws);
    expect(result?.fsPath).toBe(path.join('/project', '.annotations', 'admin', 'setting.yml'));
  });

  it('returns undefined for non-model files', () => {
    const result = modelToAnnotationPath(makeUri('/project/app/controllers/users_controller.rb') as any, ws);
    expect(result).toBeUndefined();
  });

  it('maps correctly with railsRoot config', () => {
    mockRailsRoot = 'pinpoint';
    const result = modelToAnnotationPath(makeUri('/project/pinpoint/app/models/user.rb') as any, ws);
    expect(result?.fsPath).toBe(path.join('/project', 'pinpoint', '.annotations', 'user.yml'));
  });

  it('auto-detects Rails root in subdirectory', () => {
    vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
      const s = p.toString();
      // Workspace root doesn't have annotations
      if (s === path.join('/project', '.annotations')) { return false; }
      if (s === path.join('/project', 'app', 'models')) { return false; }
      // But pinpoint/ subdirectory does
      if (s === path.join('/project', 'pinpoint', '.annotations')) { return true; }
      if (s === path.join('/project', 'pinpoint', 'app', 'models')) { return true; }
      return false;
    });
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'pinpoint', isDirectory: () => true } as any,
    ] as any);

    const result = modelToAnnotationPath(makeUri('/project/pinpoint/app/models/user.rb') as any, ws);
    expect(result?.fsPath).toBe(path.join('/project', 'pinpoint', '.annotations', 'user.yml'));
  });
});

describe('annotationToModelPath', () => {
  const ws = makeWorkspaceFolder('/project');

  it('maps an annotation back to its model', () => {
    const result = annotationToModelPath(makeUri(path.join('/project', '.annotations', 'user.yml')) as any, ws);
    expect(result?.fsPath).toBe(path.join('/project', 'app', 'models', 'user.rb'));
  });

  it('maps a namespaced annotation', () => {
    const result = annotationToModelPath(makeUri(path.join('/project', '.annotations', 'admin', 'setting.yml')) as any, ws);
    expect(result?.fsPath).toBe(path.join('/project', 'app', 'models', 'admin', 'setting.rb'));
  });

  it('returns undefined for files outside annotations dir', () => {
    const result = annotationToModelPath(makeUri('/project/other/user.yml') as any, ws);
    expect(result).toBeUndefined();
  });

  it('maps correctly with railsRoot config', () => {
    mockRailsRoot = 'pinpoint';
    const result = annotationToModelPath(makeUri(path.join('/project', 'pinpoint', '.annotations', 'user.yml')) as any, ws);
    expect(result?.fsPath).toBe(path.join('/project', 'pinpoint', 'app', 'models', 'user.rb'));
  });
});

describe('extractModelName', () => {
  const ws = makeWorkspaceFolder('/project');

  it('extracts simple model name', () => {
    expect(extractModelName(makeUri('/project/app/models/user.rb') as any, ws)).toBe('user');
  });

  it('extracts namespaced model name', () => {
    expect(extractModelName(makeUri('/project/app/models/admin/setting.rb') as any, ws)).toBe('admin/setting');
  });

  it('returns undefined for non-model files', () => {
    expect(extractModelName(makeUri('/project/lib/user.rb') as any, ws)).toBeUndefined();
  });

  it('extracts model name with railsRoot config', () => {
    mockRailsRoot = 'pinpoint';
    expect(extractModelName(makeUri('/project/pinpoint/app/models/user.rb') as any, ws)).toBe('user');
  });
});

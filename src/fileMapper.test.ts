/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';
import * as path from 'path';

// Mock vscode module before importing fileMapper
vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: () => ({
      get: (_key: string, defaultVal: string) => defaultVal,
    }),
  },
  Uri: {
    file: (fsPath: string) => ({ fsPath, toString: () => `file://${fsPath}` }),
  },
}));

import { modelToAnnotationPath, annotationToModelPath, extractModelName } from './fileMapper';

function makeUri(fsPath: string) {
  return { fsPath, toString: () => `file://${fsPath}` };
}

function makeWorkspaceFolder(rootPath: string) {
  return { uri: makeUri(rootPath) } as any;
}

describe('modelToAnnotationPath', () => {
  const ws = makeWorkspaceFolder('/project');

  it('maps a model file to its annotation', () => {
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

  it('returns undefined for files outside workspace', () => {
    const result = modelToAnnotationPath(makeUri('/other/app/models/user.rb') as any, ws);
    expect(result).toBeUndefined();
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
});

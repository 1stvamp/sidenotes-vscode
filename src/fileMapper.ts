import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Convention mapping:
 *   app/models/user.rb          -> .annotations/user.yml
 *   app/models/admin/setting.rb -> .annotations/admin/setting.yml
 */

export function getAnnotationsDir(workspaceFolder: vscode.WorkspaceFolder): string {
  const config = vscode.workspace.getConfiguration('railsSidenotes');
  const annotationsDir = config.get<string>('annotationsDir', '.annotations');
  return path.join(workspaceFolder.uri.fsPath, annotationsDir);
}

export function modelToAnnotationPath(
  fileUri: vscode.Uri,
  workspaceFolder: vscode.WorkspaceFolder
): vscode.Uri | undefined {
  const relativePath = path.relative(workspaceFolder.uri.fsPath, fileUri.fsPath);
  const normalized = relativePath.replace(/\\/g, '/');

  const modelsPrefix = 'app/models/';
  if (!normalized.startsWith(modelsPrefix)) {
    return undefined;
  }

  const modelPath = normalized.slice(modelsPrefix.length).replace(/\.rb$/, '');
  const annotationsDir = getAnnotationsDir(workspaceFolder);
  const annotationFile = path.join(annotationsDir, `${modelPath}.yml`);

  return vscode.Uri.file(annotationFile);
}

export function annotationToModelPath(
  annotationUri: vscode.Uri,
  workspaceFolder: vscode.WorkspaceFolder
): vscode.Uri | undefined {
  const annotationsDir = getAnnotationsDir(workspaceFolder);
  const relativePath = path.relative(annotationsDir, annotationUri.fsPath);

  if (relativePath.startsWith('..')) {
    return undefined;
  }

  const modelPath = relativePath.replace(/\\/g, '/').replace(/\.yml$/, '');
  const modelFile = path.join(workspaceFolder.uri.fsPath, 'app', 'models', `${modelPath}.rb`);

  return vscode.Uri.file(modelFile);
}

export function extractModelName(
  fileUri: vscode.Uri,
  workspaceFolder: vscode.WorkspaceFolder
): string | undefined {
  const relativePath = path.relative(workspaceFolder.uri.fsPath, fileUri.fsPath);
  const normalized = relativePath.replace(/\\/g, '/');

  const modelsPrefix = 'app/models/';
  if (!normalized.startsWith(modelsPrefix)) {
    return undefined;
  }

  return normalized.slice(modelsPrefix.length).replace(/\.rb$/, '');
}

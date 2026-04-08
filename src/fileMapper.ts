import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Maps between Rails model files and their corresponding annotation YAML files.
 *
 * Convention:
 *   app/models/user.rb          -> .annotations/user.yml
 *   app/models/admin/setting.rb -> .annotations/admin/setting.yml
 */

/**
 * Get the annotations directory path for a workspace folder.
 */
export function getAnnotationsDir(workspaceFolder: vscode.WorkspaceFolder): string {
  const config = vscode.workspace.getConfiguration('railsSidenotes');
  const annotationsDir = config.get<string>('annotationsDir', '.annotations');
  return path.join(workspaceFolder.uri.fsPath, annotationsDir);
}

/**
 * Given a Ruby model file URI, return the expected annotation YAML file URI.
 * Returns undefined if the file is not under app/models/.
 */
export function modelToAnnotationPath(
  fileUri: vscode.Uri,
  workspaceFolder: vscode.WorkspaceFolder
): vscode.Uri | undefined {
  const relativePath = path.relative(workspaceFolder.uri.fsPath, fileUri.fsPath);
  const normalized = relativePath.replace(/\\/g, '/');

  // Must be under app/models/
  const modelsPrefix = 'app/models/';
  if (!normalized.startsWith(modelsPrefix)) {
    return undefined;
  }

  // Strip prefix and .rb extension
  const modelPath = normalized.slice(modelsPrefix.length).replace(/\.rb$/, '');
  const annotationsDir = getAnnotationsDir(workspaceFolder);
  const annotationFile = path.join(annotationsDir, `${modelPath}.yml`);

  return vscode.Uri.file(annotationFile);
}

/**
 * Given an annotation YAML file URI, return the expected Ruby model file URI.
 */
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

/**
 * Extract the model name from a file path for display purposes.
 * e.g., "app/models/admin/setting.rb" -> "admin/setting"
 */
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

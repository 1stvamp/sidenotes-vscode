import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Convention mapping:
 *   app/models/user.rb          -> .annotations/user.yml
 *   app/models/admin/setting.rb -> .annotations/admin/setting.yml
 *
 * Auto-detects the Rails root by walking up from app/models/ to find
 * the sibling .annotations directory, or falls back to railsRoot config.
 */

// Cache detected Rails roots per workspace to avoid repeated fs lookups
const railsRootCache = new Map<string, string | null>();

export function clearRailsRootCache(): void {
  railsRootCache.clear();
}

function getConfiguredAnnotationsDir(): string {
  const config = vscode.workspace.getConfiguration('railsSidenotes');
  return config.get<string>('annotationsDir', '.annotations');
}

/**
 * Detect the Rails root for a workspace by:
 * 1. Checking the railsRoot config setting
 * 2. Searching for a directory containing both app/models/ and .annotations/
 */
function detectRailsRoot(workspaceFolder: vscode.WorkspaceFolder): string {
  const wsRoot = workspaceFolder.uri.fsPath;
  const cacheKey = wsRoot;

  if (railsRootCache.has(cacheKey)) {
    const cached = railsRootCache.get(cacheKey);
    return cached ?? wsRoot;
  }

  // Check explicit config first
  const config = vscode.workspace.getConfiguration('railsSidenotes');
  const configuredRoot = config.get<string>('railsRoot', '');
  if (configuredRoot) {
    const fullPath = path.join(wsRoot, configuredRoot);
    railsRootCache.set(cacheKey, fullPath);
    return fullPath;
  }

  const annotationsDir = getConfiguredAnnotationsDir();

  // Check workspace root first (most common case)
  if (fs.existsSync(path.join(wsRoot, annotationsDir)) && fs.existsSync(path.join(wsRoot, 'app', 'models'))) {
    railsRootCache.set(cacheKey, wsRoot);
    return wsRoot;
  }

  // Walk immediate subdirectories looking for a Rails root with annotations
  try {
    const entries = fs.readdirSync(wsRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') {
        continue;
      }
      const candidate = path.join(wsRoot, entry.name);
      if (fs.existsSync(path.join(candidate, annotationsDir)) && fs.existsSync(path.join(candidate, 'app', 'models'))) {
        railsRootCache.set(cacheKey, candidate);
        return candidate;
      }
    }
  } catch {
    // If we can't read the directory, fall through
  }

  railsRootCache.set(cacheKey, null);
  return wsRoot;
}

export function getAnnotationsDir(workspaceFolder: vscode.WorkspaceFolder): string {
  const railsRoot = detectRailsRoot(workspaceFolder);
  return path.join(railsRoot, getConfiguredAnnotationsDir());
}

export function modelToAnnotationPath(
  fileUri: vscode.Uri,
  workspaceFolder: vscode.WorkspaceFolder
): vscode.Uri | undefined {
  const railsRoot = detectRailsRoot(workspaceFolder);
  const relativePath = path.relative(railsRoot, fileUri.fsPath);
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

  const railsRoot = detectRailsRoot(workspaceFolder);
  const modelPath = relativePath.replace(/\\/g, '/').replace(/\.yml$/, '');
  const modelFile = path.join(railsRoot, 'app', 'models', `${modelPath}.rb`);

  return vscode.Uri.file(modelFile);
}

export function extractModelName(
  fileUri: vscode.Uri,
  workspaceFolder: vscode.WorkspaceFolder
): string | undefined {
  const railsRoot = detectRailsRoot(workspaceFolder);
  const relativePath = path.relative(railsRoot, fileUri.fsPath);
  const normalized = relativePath.replace(/\\/g, '/');

  const modelsPrefix = 'app/models/';
  if (!normalized.startsWith(modelsPrefix)) {
    return undefined;
  }

  return normalized.slice(modelsPrefix.length).replace(/\.rb$/, '');
}

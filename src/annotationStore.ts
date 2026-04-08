import * as vscode from 'vscode';
import * as fs from 'fs';
import * as YAML from 'yaml';
import { ModelAnnotation } from './types';
import { modelToAnnotationPath, getAnnotationsDir } from './fileMapper';

/**
 * Central store for parsed annotation data.
 * Caches parsed YAML and provides lookup by model file URI.
 * Watches for file changes and invalidates cache accordingly.
 */
export class AnnotationStore implements vscode.Disposable {
  private cache: Map<string, ModelAnnotation> = new Map();
  private watcher: vscode.FileSystemWatcher | undefined;
  private disposables: vscode.Disposable[] = [];

  private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri | undefined>();
  /** Fires when annotation data changes. Uri is the model file, or undefined for bulk refresh. */
  public readonly onDidChange = this._onDidChange.event;

  constructor() {
    this.setupWatcher();
  }

  private setupWatcher(): void {
    // Watch for changes in all .annotations/**/*.yml files across workspaces
    this.watcher = vscode.workspace.createFileSystemWatcher('**/.annotations/**/*.yml');

    this.watcher.onDidChange((uri) => this.handleAnnotationChange(uri));
    this.watcher.onDidCreate((uri) => this.handleAnnotationChange(uri));
    this.watcher.onDidDelete((uri) => this.handleAnnotationDelete(uri));

    this.disposables.push(this.watcher);
  }

  private handleAnnotationChange(annotationUri: vscode.Uri): void {
    // Invalidate the cache entry whose key matches this annotation file
    for (const [key, _value] of this.cache) {
      if (this.annotationUriForCacheKey(key)?.toString() === annotationUri.toString()) {
        this.cache.delete(key);
        this._onDidChange.fire(vscode.Uri.parse(key));
        return;
      }
    }
    // If not found in cache, fire a general refresh
    this._onDidChange.fire(undefined);
  }

  private handleAnnotationDelete(annotationUri: vscode.Uri): void {
    for (const [key, _value] of this.cache) {
      if (this.annotationUriForCacheKey(key)?.toString() === annotationUri.toString()) {
        this.cache.delete(key);
        this._onDidChange.fire(vscode.Uri.parse(key));
        return;
      }
    }
  }

  private annotationUriForCacheKey(cacheKey: string): vscode.Uri | undefined {
    const modelUri = vscode.Uri.parse(cacheKey);
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(modelUri);
    if (!workspaceFolder) {
      return undefined;
    }
    return modelToAnnotationPath(modelUri, workspaceFolder);
  }

  /**
   * Get annotation data for a given model file.
   * Returns undefined if no annotation file exists.
   */
  public getAnnotation(modelUri: vscode.Uri): ModelAnnotation | undefined {
    const cacheKey = modelUri.toString();

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(modelUri);
    if (!workspaceFolder) {
      return undefined;
    }

    const annotationUri = modelToAnnotationPath(modelUri, workspaceFolder);
    if (!annotationUri) {
      return undefined;
    }

    const annotation = this.parseAnnotationFile(annotationUri);
    if (annotation) {
      this.cache.set(cacheKey, annotation);
    }
    return annotation;
  }

  /**
   * Parse a YAML annotation file into a ModelAnnotation.
   */
  private parseAnnotationFile(uri: vscode.Uri): ModelAnnotation | undefined {
    try {
      if (!fs.existsSync(uri.fsPath)) {
        return undefined;
      }
      const content = fs.readFileSync(uri.fsPath, 'utf-8');
      const parsed = YAML.parse(content);

      if (!parsed || typeof parsed !== 'object') {
        return undefined;
      }

      const annotation: ModelAnnotation = {
        table_name: parsed.table_name ?? '',
        primary_key: parsed.primary_key ?? 'id',
        columns: Array.isArray(parsed.columns)
          ? parsed.columns.map((c: Record<string, unknown>) => ({
              name: String(c.name ?? ''),
              type: String(c.type ?? 'unknown'),
              nullable: Boolean(c.nullable),
              default: c.default !== undefined ? c.default as string | number | boolean | null : undefined,
              limit: typeof c.limit === 'number' ? c.limit : undefined,
              precision: typeof c.precision === 'number' ? c.precision : undefined,
              scale: typeof c.scale === 'number' ? c.scale : undefined,
              comment: typeof c.comment === 'string' ? c.comment : undefined,
            }))
          : [],
        indexes: Array.isArray(parsed.indexes)
          ? parsed.indexes.map((i: Record<string, unknown>) => ({
              name: String(i.name ?? ''),
              columns: Array.isArray(i.columns) ? i.columns.map(String) : [],
              unique: Boolean(i.unique),
              where: typeof i.where === 'string' ? i.where : undefined,
              using: typeof i.using === 'string' ? i.using : undefined,
              comment: typeof i.comment === 'string' ? i.comment : undefined,
            }))
          : [],
        associations: Array.isArray(parsed.associations)
          ? parsed.associations.map((a: Record<string, unknown>) => ({
              type: String(a.type ?? '') as 'belongs_to' | 'has_one' | 'has_many' | 'has_and_belongs_to_many',
              name: String(a.name ?? ''),
              class_name: String(a.class_name ?? ''),
              foreign_key: String(a.foreign_key ?? ''),
              through: typeof a.through === 'string' ? a.through : undefined,
              polymorphic: typeof a.polymorphic === 'boolean' ? a.polymorphic : undefined,
              dependent: typeof a.dependent === 'string' ? a.dependent : undefined,
            }))
          : [],
      };

      return annotation;
    } catch (error) {
      console.warn(`[Rails Sidenotes] Failed to parse annotation: ${uri.fsPath}`, error);
      return undefined;
    }
  }

  /**
   * Preload all annotations from the workspace.
   */
  public async preload(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return;
    }

    for (const folder of workspaceFolders) {
      const annotationsDir = getAnnotationsDir(folder);
      if (!fs.existsSync(annotationsDir)) {
        continue;
      }

      const pattern = new vscode.RelativePattern(annotationsDir, '**/*.yml');
      const files = await vscode.workspace.findFiles(pattern);

      for (const _file of files) {
        // Annotations are loaded on demand; this just warms the file list
      }
    }
  }

  /**
   * Clear all cached data.
   */
  public clearCache(): void {
    this.cache.clear();
    this._onDidChange.fire(undefined);
  }

  public dispose(): void {
    this._onDidChange.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}

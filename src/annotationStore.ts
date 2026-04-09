import * as vscode from 'vscode';
import * as YAML from 'yaml';
import { ModelAnnotation } from './types';
import { modelToAnnotationPath, annotationToModelPath, getAnnotationsDir } from './fileMapper';

export class AnnotationStore implements vscode.Disposable {
  private cache: Map<string, ModelAnnotation> = new Map();
  // Reverse map: annotation URI string → model URI string for O(1) cache invalidation
  private reverseMap: Map<string, string> = new Map();
  private watcher: vscode.FileSystemWatcher | undefined;
  private disposables: vscode.Disposable[] = [];

  private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri | undefined>();
  public readonly onDidChange = this._onDidChange.event;

  constructor() {
    this.setupWatcher();
  }

  private setupWatcher(): void {
    this.watcher = vscode.workspace.createFileSystemWatcher('**/.annotations/**/*.yml');

    this.watcher.onDidChange((uri) => this.handleAnnotationChange(uri));
    this.watcher.onDidCreate((uri) => this.handleAnnotationChange(uri));
    this.watcher.onDidDelete((uri) => this.handleAnnotationDelete(uri));

    this.disposables.push(this.watcher);
  }

  private handleAnnotationChange(annotationUri: vscode.Uri): void {
    const annotationKey = annotationUri.toString();
    const modelKey = this.reverseMap.get(annotationKey);
    if (modelKey) {
      this.cache.delete(modelKey);
      this.reverseMap.delete(annotationKey);
      this._onDidChange.fire(vscode.Uri.parse(modelKey));
    } else {
      this._onDidChange.fire(undefined);
    }
  }

  private handleAnnotationDelete(annotationUri: vscode.Uri): void {
    const annotationKey = annotationUri.toString();
    const modelKey = this.reverseMap.get(annotationKey);
    if (modelKey) {
      this.cache.delete(modelKey);
      this.reverseMap.delete(annotationKey);
      this._onDidChange.fire(vscode.Uri.parse(modelKey));
    }
  }

  public getAnnotation(modelUri: vscode.Uri): ModelAnnotation | undefined {
    const cacheKey = modelUri.toString();

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // Synchronous fallback for providers that need immediate results.
    // Prefer preload() for bulk loading at activation.
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(modelUri);
    if (!workspaceFolder) {
      return undefined;
    }

    const annotationUri = modelToAnnotationPath(modelUri, workspaceFolder);
    if (!annotationUri) {
      return undefined;
    }

    return undefined;
  }

  /**
   * Async annotation fetch — loads from disk if not cached.
   */
  public async getAnnotationAsync(modelUri: vscode.Uri): Promise<ModelAnnotation | undefined> {
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

    const annotation = await this.parseAnnotationFile(annotationUri);
    if (annotation) {
      this.cache.set(cacheKey, annotation);
      this.reverseMap.set(annotationUri.toString(), cacheKey);
    }
    return annotation;
  }

  private async parseAnnotationFile(uri: vscode.Uri): Promise<ModelAnnotation | undefined> {
    try {
      const data = await vscode.workspace.fs.readFile(uri);
      const content = Buffer.from(data).toString('utf-8');
      const parsed = YAML.parse(content);

      if (!parsed || typeof parsed !== 'object') {
        return undefined;
      }

      return {
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
    } catch (error) {
      if (error instanceof vscode.FileSystemError) {
        return undefined;
      }
      console.warn(`[Rails Sidenotes] Failed to parse annotation: ${uri.fsPath}`, error);
      return undefined;
    }
  }

  /**
   * Preload all annotations from the workspace into cache.
   */
  public async preload(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return;
    }

    for (const folder of workspaceFolders) {
      const annotationsDir = getAnnotationsDir(folder);
      const pattern = new vscode.RelativePattern(annotationsDir, '**/*.yml');

      let files: vscode.Uri[];
      try {
        files = await vscode.workspace.findFiles(pattern);
      } catch {
        continue;
      }

      for (const file of files) {
        const modelUri = annotationToModelPath(file, folder);
        if (!modelUri) {
          continue;
        }
        const cacheKey = modelUri.toString();
        if (this.cache.has(cacheKey)) {
          continue;
        }
        const annotation = await this.parseAnnotationFile(file);
        if (annotation) {
          this.cache.set(cacheKey, annotation);
          this.reverseMap.set(file.toString(), cacheKey);
        }
      }
    }
  }

  public clearCache(): void {
    this.cache.clear();
    this.reverseMap.clear();
    this._onDidChange.fire(undefined);
  }

  public dispose(): void {
    this._onDidChange.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}

import * as vscode from 'vscode';
import { AnnotationStore } from './annotationStore';
import { ModelAnnotation } from './types';

/**
 * Provides CodeLens above class definitions in Ruby model files.
 * Shows a summary like: "users: 15 columns, 3 indexes, 5 associations"
 * Clicking opens the detail panel.
 */
export class SidenotesCodeLensProvider implements vscode.CodeLensProvider {
  private readonly _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  constructor(private store: AnnotationStore) {
    store.onDidChange(() => this._onDidChangeCodeLenses.fire());
  }

  public provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.CodeLens[] {
    const config = vscode.workspace.getConfiguration('railsSidenotes');
    if (!config.get<boolean>('showCodeLens', true)) {
      return [];
    }

    const annotation = this.store.getAnnotation(document.uri);
    if (!annotation) {
      return [];
    }

    const classLine = this.findClassDefinitionLine(document);
    if (classLine === -1) {
      return [];
    }

    const range = new vscode.Range(classLine, 0, classLine, 0);
    const summary = this.buildSummary(annotation);

    const lens = new vscode.CodeLens(range, {
      title: summary,
      command: 'railsSidenotes.showDetail',
      arguments: [document.uri],
      tooltip: 'Click to view full schema details',
    });

    return [lens];
  }

  /**
   * Find the line number of the first class definition in the document.
   * Matches patterns like:
   *   class User < ApplicationRecord
   *   class Admin::Setting < ApplicationRecord
   */
  private findClassDefinitionLine(document: vscode.TextDocument): number {
    const classPattern = /^\s*class\s+[\w:]+\s*(<\s*[\w:]+)?/;

    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i).text;
      if (classPattern.test(line)) {
        return i;
      }
    }
    return -1;
  }

  private buildSummary(annotation: ModelAnnotation): string {
    const cols = annotation.columns.length;
    const idxs = annotation.indexes.length;
    const assocs = annotation.associations.length;

    const parts: string[] = [];
    parts.push(`${cols} column${cols !== 1 ? 's' : ''}`);
    if (idxs > 0) {
      parts.push(`${idxs} index${idxs !== 1 ? 'es' : ''}`);
    }
    if (assocs > 0) {
      parts.push(`${assocs} association${assocs !== 1 ? 's' : ''}`);
    }

    return `\u{1F4CB} ${annotation.table_name}: ${parts.join(', ')}`;
  }
}

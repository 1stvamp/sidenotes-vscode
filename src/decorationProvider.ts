import * as vscode from 'vscode';
import { AnnotationStore } from './annotationStore';
import { buildColumnMap, formatColumnInline, ColumnMap } from './types';

/**
 * Provides inline decorations next to attribute references in Ruby model files.
 * Shows faded text like "# string, not null" after lines referencing columns.
 */
export class DecorationProvider implements vscode.Disposable {
  private decorationType: vscode.TextEditorDecorationType;
  private disposables: vscode.Disposable[] = [];

  constructor(private store: AnnotationStore) {
    this.decorationType = vscode.window.createTextEditorDecorationType({
      after: {
        color: new vscode.ThemeColor('editorCodeLens.foreground'),
        fontStyle: 'italic',
        margin: '0 0 0 1.5em',
      },
      isWholeLine: false,
    });

    // Update decorations when the active editor changes
    vscode.window.onDidChangeActiveTextEditor(
      (editor) => {
        if (editor) {
          this.updateDecorations(editor);
        }
      },
      null,
      this.disposables
    );

    // Update when document content changes
    vscode.workspace.onDidChangeTextDocument(
      (event) => {
        const editor = vscode.window.activeTextEditor;
        if (editor && event.document === editor.document) {
          this.updateDecorations(editor);
        }
      },
      null,
      this.disposables
    );

    // Update when annotations change
    store.onDidChange(
      () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          this.updateDecorations(editor);
        }
      },
      null,
      this.disposables
    );

    // Initial decoration
    if (vscode.window.activeTextEditor) {
      this.updateDecorations(vscode.window.activeTextEditor);
    }
  }

  public updateDecorations(editor: vscode.TextEditor): void {
    const config = vscode.workspace.getConfiguration('railsSidenotes');
    if (!config.get<boolean>('showInlineDecorations', true)) {
      editor.setDecorations(this.decorationType, []);
      return;
    }

    if (editor.document.languageId !== 'ruby') {
      editor.setDecorations(this.decorationType, []);
      return;
    }

    const annotation = this.store.getAnnotation(editor.document.uri);
    if (!annotation) {
      editor.setDecorations(this.decorationType, []);
      return;
    }

    const columnMap = buildColumnMap(annotation);
    const decorations = this.collectDecorations(editor.document, columnMap);
    editor.setDecorations(this.decorationType, decorations);
  }

  private collectDecorations(
    document: vscode.TextDocument,
    columnMap: ColumnMap
  ): vscode.DecorationOptions[] {
    const decorations: vscode.DecorationOptions[] = [];

    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      const text = line.text;

      // Match common Rails patterns that reference columns:
      // - validates :email, ...
      // - attribute :name, ...
      // - scope :active, -> { where(active: true) }
      // - has_secure_password (implies password_digest)
      // - delegate :name, to: :association
      // - field definitions in ActiveModel

      const attrPatterns: RegExp[] = [
        // validates :col_name or validates_presence_of :col_name
        /validates?(?:_\w+)?\s+:(\w+)/,
        // attribute :col_name
        /\battribute\s+:(\w+)/,
        // Direct symbol references common in Rails models
        /\bscope\s+:\w+.*?where\((\w+):/,
      ];

      for (const pattern of attrPatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          const colName = match[1];
          const col = columnMap.get(colName);
          if (col) {
            const range = new vscode.Range(i, line.text.trimEnd().length, i, line.text.trimEnd().length);
            decorations.push({
              range,
              renderOptions: {
                after: {
                  contentText: `  # ${formatColumnInline(col)}`,
                },
              },
            });
            break; // One decoration per line
          }
        }
      }

      // Match multi-symbol lines: validates :email, :name, :phone
      const multiSymbolMatch = text.match(/validates?\s+((?::\w+\s*,?\s*)+)/);
      if (multiSymbolMatch && !decorations.some(d => d.range.start.line === i)) {
        const symbols = multiSymbolMatch[1].match(/:(\w+)/g);
        if (symbols) {
          const infos: string[] = [];
          for (const sym of symbols) {
            const colName = sym.replace(':', '');
            const col = columnMap.get(colName);
            if (col) {
              infos.push(`${colName}: ${col.type}`);
            }
          }
          if (infos.length > 0) {
            const range = new vscode.Range(i, line.text.trimEnd().length, i, line.text.trimEnd().length);
            decorations.push({
              range,
              renderOptions: {
                after: {
                  contentText: `  # ${infos.join(', ')}`,
                },
              },
            });
          }
        }
      }
    }

    return decorations;
  }

  public dispose(): void {
    this.decorationType.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}

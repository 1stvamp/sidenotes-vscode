import * as vscode from 'vscode';
import { AnnotationStore } from './annotationStore';
import { buildColumnMap, formatColumnInline, ColumnMap } from './types';

export class DecorationProvider implements vscode.Disposable {
  private decorationType: vscode.TextEditorDecorationType;
  private disposables: vscode.Disposable[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private store: AnnotationStore) {
    this.decorationType = vscode.window.createTextEditorDecorationType({
      after: {
        color: new vscode.ThemeColor('editorCodeLens.foreground'),
        fontStyle: 'italic',
        margin: '0 0 0 1.5em',
      },
      isWholeLine: false,
    });

    vscode.window.onDidChangeActiveTextEditor(
      (editor) => {
        if (editor) {
          this.scheduleUpdate(editor);
        }
      },
      null,
      this.disposables
    );

    vscode.workspace.onDidChangeTextDocument(
      (event) => {
        const editor = vscode.window.activeTextEditor;
        if (editor && event.document === editor.document) {
          this.scheduleUpdate(editor);
        }
      },
      null,
      this.disposables
    );

    store.onDidChange(
      () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          this.scheduleUpdate(editor);
        }
      },
      null,
      this.disposables
    );

    if (vscode.window.activeTextEditor) {
      this.scheduleUpdate(vscode.window.activeTextEditor);
    }
  }

  private scheduleUpdate(editor: vscode.TextEditor): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.updateDecorations(editor);
    }, 150);
  }

  public async updateDecorations(editor: vscode.TextEditor): Promise<void> {
    const config = vscode.workspace.getConfiguration('railsSidenotes');
    if (!config.get<boolean>('showInlineDecorations', true)) {
      editor.setDecorations(this.decorationType, []);
      return;
    }

    if (editor.document.languageId !== 'ruby') {
      editor.setDecorations(this.decorationType, []);
      return;
    }

    const annotation = await this.store.getAnnotationAsync(editor.document.uri);
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
      const text = document.lineAt(i).text;

      // Extract all :symbol references from validates/attribute lines
      const multiMatch = text.match(/validates?(?:_\w+)?\s+((?::\w+[\s,]*)+)/);
      if (multiMatch) {
        const symbols = [...multiMatch[1].matchAll(/:(\w+)/g)];
        const infos: string[] = [];
        for (const sym of symbols) {
          const col = columnMap.get(sym[1]);
          if (col) {
            infos.push(symbols.length === 1
              ? formatColumnInline(col)
              : `${sym[1]}: ${col.type}`);
          }
        }
        if (infos.length > 0) {
          decorations.push({
            range: new vscode.Range(i, text.trimEnd().length, i, text.trimEnd().length),
            renderOptions: {
              after: { contentText: `  # ${infos.join(', ')}` },
            },
          });
        }
        continue;
      }

      // attribute :col_name
      const attrMatch = text.match(/\battribute\s+:(\w+)/);
      if (attrMatch) {
        const col = columnMap.get(attrMatch[1]);
        if (col) {
          decorations.push({
            range: new vscode.Range(i, text.trimEnd().length, i, text.trimEnd().length),
            renderOptions: {
              after: { contentText: `  # ${formatColumnInline(col)}` },
            },
          });
        }
        continue;
      }

      // scope :name, -> { where(col: value) }
      const scopeMatch = text.match(/\bscope\s+:\w+.*?where\((\w+):/);
      if (scopeMatch) {
        const col = columnMap.get(scopeMatch[1]);
        if (col) {
          decorations.push({
            range: new vscode.Range(i, text.trimEnd().length, i, text.trimEnd().length),
            renderOptions: {
              after: { contentText: `  # ${formatColumnInline(col)}` },
            },
          });
        }
      }
    }

    return decorations;
  }

  public dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.decorationType.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}

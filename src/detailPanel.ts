import * as vscode from 'vscode';
import { AnnotationStore } from './annotationStore';
import { ModelAnnotation, ColumnInfo, IndexInfo, AssociationInfo } from './types';
import { extractModelName } from './fileMapper';

/**
 * Manages a Webview panel that displays full schema details for a model.
 */
export class DetailPanel {
  private static currentPanel: DetailPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  public static show(
    modelUri: vscode.Uri,
    store: AnnotationStore,
    extensionUri: vscode.Uri
  ): void {
    const annotation = store.getAnnotation(modelUri);
    if (!annotation) {
      vscode.window.showWarningMessage('No annotation data found for this model.');
      return;
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(modelUri);
    const modelName = workspaceFolder
      ? extractModelName(modelUri, workspaceFolder) ?? 'model'
      : 'model';

    if (DetailPanel.currentPanel) {
      DetailPanel.currentPanel.panel.reveal(vscode.ViewColumn.Beside);
      DetailPanel.currentPanel.update(annotation, modelName);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'railsSidenotes.detail',
      `Schema: ${modelName}`,
      vscode.ViewColumn.Beside,
      {
        enableScripts: false,
        localResourceRoots: [extensionUri],
      }
    );

    DetailPanel.currentPanel = new DetailPanel(panel, annotation, modelName);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    annotation: ModelAnnotation,
    modelName: string
  ) {
    this.panel = panel;
    this.update(annotation, modelName);

    this.panel.onDidDispose(
      () => {
        DetailPanel.currentPanel = undefined;
        for (const d of this.disposables) {
          d.dispose();
        }
      },
      null,
      this.disposables
    );
  }

  private update(annotation: ModelAnnotation, modelName: string): void {
    this.panel.title = `Schema: ${modelName}`;
    this.panel.webview.html = this.getHtml(annotation, modelName);
  }

  private getHtml(annotation: ModelAnnotation, modelName: string): string {
    const columnsHtml = annotation.columns.map(c => this.columnRow(c)).join('\n');
    const indexesHtml = annotation.indexes.map(i => this.indexRow(i)).join('\n');
    const associationsHtml = annotation.associations.map(a => this.associationRow(a)).join('\n');

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Schema: ${this.escape(modelName)}</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 16px;
      line-height: 1.5;
    }
    h1 { font-size: 1.4em; margin-bottom: 4px; }
    h2 {
      font-size: 1.1em;
      margin-top: 20px;
      margin-bottom: 8px;
      border-bottom: 1px solid var(--vscode-widget-border);
      padding-bottom: 4px;
    }
    .meta { color: var(--vscode-descriptionForeground); margin-bottom: 16px; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 16px; }
    th, td {
      text-align: left;
      padding: 4px 10px;
      border: 1px solid var(--vscode-widget-border);
    }
    th { background: var(--vscode-editor-inactiveSelectionBackground); font-weight: 600; }
    code {
      font-family: var(--vscode-editor-font-family);
      font-size: var(--vscode-editor-font-size);
      background: var(--vscode-textCodeBlock-background);
      padding: 1px 4px;
      border-radius: 3px;
    }
    .badge {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 3px;
      font-size: 0.85em;
      font-weight: 500;
    }
    .badge-unique { background: var(--vscode-testing-iconPassed); color: #fff; }
    .badge-type { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
    .nullable { color: var(--vscode-descriptionForeground); }
    .not-null { font-weight: 600; }
    ul { padding-left: 20px; }
    li { margin-bottom: 4px; }
  </style>
</head>
<body>
  <h1>${this.escape(modelName)}</h1>
  <div class="meta">
    Table: <code>${this.escape(annotation.table_name)}</code> &middot;
    Primary key: <code>${this.escape(annotation.primary_key)}</code>
  </div>

  <h2>Columns (${annotation.columns.length})</h2>
  <table>
    <thead>
      <tr><th>Name</th><th>Type</th><th>Nullable</th><th>Default</th></tr>
    </thead>
    <tbody>
      ${columnsHtml}
    </tbody>
  </table>

  ${annotation.indexes.length > 0 ? `
  <h2>Indexes (${annotation.indexes.length})</h2>
  <ul>${indexesHtml}</ul>
  ` : ''}

  ${annotation.associations.length > 0 ? `
  <h2>Associations (${annotation.associations.length})</h2>
  <ul>${associationsHtml}</ul>
  ` : ''}
</body>
</html>`;
  }

  private columnRow(col: ColumnInfo): string {
    const nullableClass = col.nullable ? 'nullable' : 'not-null';
    const nullableText = col.nullable ? 'yes' : 'no';
    const defaultVal = col.default !== undefined && col.default !== null
      ? `<code>${this.escape(String(col.default))}</code>`
      : '&mdash;';

    return `<tr>
      <td><code>${this.escape(col.name)}</code></td>
      <td><span class="badge badge-type">${this.escape(col.type)}</span></td>
      <td class="${nullableClass}">${nullableText}</td>
      <td>${defaultVal}</td>
    </tr>`;
  }

  private indexRow(idx: IndexInfo): string {
    const uniqueBadge = idx.unique ? ' <span class="badge badge-unique">unique</span>' : '';
    const cols = idx.columns.map(c => `<code>${this.escape(c)}</code>`).join(', ');
    return `<li><code>${this.escape(idx.name)}</code>${uniqueBadge} on (${cols})</li>`;
  }

  private associationRow(assoc: AssociationInfo): string {
    let html = `<li><strong>${this.escape(assoc.type)}</strong> <code>:${this.escape(assoc.name)}</code>`;
    html += ` &rarr; <code>${this.escape(assoc.class_name)}</code>`;
    if (assoc.foreign_key) {
      html += ` (fk: <code>${this.escape(assoc.foreign_key)}</code>)`;
    }
    if (assoc.through) {
      html += ` through <code>:${this.escape(assoc.through)}</code>`;
    }
    if (assoc.dependent) {
      html += ` dependent: <code>${this.escape(assoc.dependent)}</code>`;
    }
    html += '</li>';
    return html;
  }

  private escape(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

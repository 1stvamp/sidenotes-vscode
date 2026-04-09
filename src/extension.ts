import * as vscode from 'vscode';
import { AnnotationStore } from './annotationStore';
import { SidenotesCodeLensProvider } from './codeLensProvider';
import { SidenotesHoverProvider } from './hoverProvider';
import { DecorationProvider } from './decorationProvider';
import { DetailPanel } from './detailPanel';

let store: AnnotationStore;

export function activate(context: vscode.ExtensionContext): void {
  store = new AnnotationStore();
  context.subscriptions.push(store);

  const codeLensProvider = new SidenotesCodeLensProvider(store);
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: 'ruby', scheme: 'file' },
      codeLensProvider
    )
  );

  const hoverProvider = new SidenotesHoverProvider(store);
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { language: 'ruby', scheme: 'file' },
      hoverProvider
    )
  );

  const decorationProvider = new DecorationProvider(store);
  context.subscriptions.push(decorationProvider);

  context.subscriptions.push(
    vscode.commands.registerCommand('railsSidenotes.showDetail', (uri?: vscode.Uri) => {
      const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!targetUri) {
        vscode.window.showWarningMessage('No active Ruby file to show schema details for.');
        return;
      }
      DetailPanel.show(targetUri, store, context.extensionUri);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('railsSidenotes.regenerate', () => {
      const terminal = vscode.window.createTerminal('Rails Sidenotes');
      terminal.show();
      terminal.sendText('bundle exec rake sidenotes:generate');
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('railsSidenotes')) {
        store.clearCache();
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          decorationProvider.updateDecorations(editor);
        }
      }
    })
  );

  store.preload().catch(
    (err) => console.warn('[Rails Sidenotes] Preload error:', err)
  );
}

export function deactivate(): void {
  // Cleanup handled by disposables
}

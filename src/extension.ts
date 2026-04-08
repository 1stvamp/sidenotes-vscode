import * as vscode from 'vscode';
import { AnnotationStore } from './annotationStore';
import { SidenotesCodeLensProvider } from './codeLensProvider';
import { SidenotesHoverProvider } from './hoverProvider';
import { DecorationProvider } from './decorationProvider';
import { DetailPanel } from './detailPanel';

let store: AnnotationStore;

export function activate(context: vscode.ExtensionContext): void {
  console.log('[Rails Sidenotes] Extension activating...');

  store = new AnnotationStore();
  context.subscriptions.push(store);

  // Register CodeLens provider for Ruby files
  const codeLensProvider = new SidenotesCodeLensProvider(store);
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: 'ruby', scheme: 'file' },
      codeLensProvider
    )
  );

  // Register Hover provider for Ruby files
  const hoverProvider = new SidenotesHoverProvider(store);
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { language: 'ruby', scheme: 'file' },
      hoverProvider
    )
  );

  // Register Decoration provider
  const decorationProvider = new DecorationProvider(store);
  context.subscriptions.push(decorationProvider);

  // Command: Show Detail Panel
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

  // Command: Regenerate annotations
  context.subscriptions.push(
    vscode.commands.registerCommand('railsSidenotes.regenerate', () => {
      const terminal = vscode.window.createTerminal('Rails Sidenotes');
      terminal.show();
      terminal.sendText('bundle exec rake sidenotes:generate');
    })
  );

  // Refresh decorations when configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('railsSidenotes')) {
        store.clearCache();
        // Refresh decorations on active editor
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          decorationProvider.updateDecorations(editor);
        }
      }
    })
  );

  // Preload annotation data
  store.preload().then(
    () => console.log('[Rails Sidenotes] Preload complete.'),
    (err) => console.warn('[Rails Sidenotes] Preload error:', err)
  );

  console.log('[Rails Sidenotes] Extension activated.');
}

export function deactivate(): void {
  // Cleanup handled by disposables
}

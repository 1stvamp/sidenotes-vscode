import * as vscode from 'vscode';
import { AnnotationStore } from './annotationStore';
import { ModelAnnotation, ColumnInfo, IndexInfo, AssociationInfo } from './types';

/**
 * Provides hover cards when hovering over the class name in a Ruby model file.
 * Displays the full schema including columns, indexes, and associations.
 */
export class SidenotesHoverProvider implements vscode.HoverProvider {
  constructor(private store: AnnotationStore) {}

  public provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): vscode.Hover | undefined {
    const annotation = this.store.getAnnotation(document.uri);
    if (!annotation) {
      return undefined;
    }

    const wordRange = document.getWordRangeAtPosition(position, /[A-Z]\w+/);
    if (!wordRange) {
      return undefined;
    }

    const word = document.getText(wordRange);
    const line = document.lineAt(position.line).text;

    // Only show hover on class name in class definition line
    const classMatch = line.match(/^\s*class\s+([\w:]+)/);
    if (!classMatch) {
      return undefined;
    }

    // Check if the hovered word is part of the class name (not the parent class)
    const className = classMatch[1];
    const simpleNames = className.split('::');
    if (!simpleNames.includes(word)) {
      return undefined;
    }

    const markdown = this.buildHoverContent(annotation);
    return new vscode.Hover(markdown, wordRange);
  }

  private buildHoverContent(annotation: ModelAnnotation): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.supportThemeIcons = true;

    md.appendMarkdown(`### $(database) ${annotation.table_name}\n\n`);
    md.appendMarkdown(`**Primary key:** \`${annotation.primary_key}\`\n\n`);

    // Columns table
    if (annotation.columns.length > 0) {
      md.appendMarkdown(`#### Columns (${annotation.columns.length})\n\n`);
      md.appendMarkdown('| Column | Type | Nullable | Default |\n');
      md.appendMarkdown('|--------|------|----------|----------|\n');
      for (const col of annotation.columns) {
        md.appendMarkdown(this.formatColumnRow(col));
      }
      md.appendMarkdown('\n');
    }

    // Indexes
    if (annotation.indexes.length > 0) {
      md.appendMarkdown(`#### Indexes (${annotation.indexes.length})\n\n`);
      for (const idx of annotation.indexes) {
        md.appendMarkdown(this.formatIndex(idx));
      }
      md.appendMarkdown('\n');
    }

    // Associations
    if (annotation.associations.length > 0) {
      md.appendMarkdown(`#### Associations (${annotation.associations.length})\n\n`);
      for (const assoc of annotation.associations) {
        md.appendMarkdown(this.formatAssociation(assoc));
      }
    }

    return md;
  }

  private formatColumnRow(col: ColumnInfo): string {
    const nullable = col.nullable ? 'yes' : '**no**';
    const defaultVal = col.default !== undefined && col.default !== null
      ? `\`${col.default}\``
      : '-';
    return `| \`${col.name}\` | ${col.type} | ${nullable} | ${defaultVal} |\n`;
  }

  private formatIndex(idx: IndexInfo): string {
    const uniqueLabel = idx.unique ? ' $(key) **unique**' : '';
    return `- \`${idx.name}\`${uniqueLabel} on (${idx.columns.map(c => `\`${c}\``).join(', ')})\n`;
  }

  private formatAssociation(assoc: AssociationInfo): string {
    let line = `- **${assoc.type}** \`:${assoc.name}\``;
    line += ` \u2192 \`${assoc.class_name}\``;
    if (assoc.foreign_key) {
      line += ` (fk: \`${assoc.foreign_key}\`)`;
    }
    if (assoc.through) {
      line += ` through \`:${assoc.through}\``;
    }
    return line + '\n';
  }
}

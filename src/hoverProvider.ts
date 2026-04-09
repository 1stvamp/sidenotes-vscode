import * as vscode from 'vscode';
import { AnnotationStore } from './annotationStore';
import { ModelAnnotation, ColumnInfo, IndexInfo, AssociationInfo } from './types';

export class SidenotesHoverProvider implements vscode.HoverProvider {
  constructor(private store: AnnotationStore) {}

  public async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): Promise<vscode.Hover | undefined> {
    const wordRange = document.getWordRangeAtPosition(position, /[A-Z]\w+/);
    if (!wordRange) {
      return undefined;
    }

    const line = document.lineAt(position.line).text;
    const classMatch = line.match(/^\s*class\s+([\w:]+)/);
    if (!classMatch) {
      return undefined;
    }

    // Only trigger on the class name itself, not the parent class
    const className = classMatch[1];
    const classNameStart = line.indexOf(className, line.indexOf('class') + 5);
    const classNameEnd = classNameStart + className.length;
    const wordStart = wordRange.start.character;
    if (wordStart < classNameStart || wordStart >= classNameEnd) {
      return undefined;
    }

    const annotation = await this.store.getAnnotationAsync(document.uri);
    if (!annotation) {
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

    if (annotation.columns.length > 0) {
      md.appendMarkdown(`#### Columns (${annotation.columns.length})\n\n`);
      md.appendMarkdown('| Column | Type | Nullable | Default |\n');
      md.appendMarkdown('|--------|------|----------|----------|\n');
      for (const col of annotation.columns) {
        md.appendMarkdown(this.formatColumnRow(col));
      }
      md.appendMarkdown('\n');
    }

    if (annotation.indexes.length > 0) {
      md.appendMarkdown(`#### Indexes (${annotation.indexes.length})\n\n`);
      for (const idx of annotation.indexes) {
        md.appendMarkdown(this.formatIndex(idx));
      }
      md.appendMarkdown('\n');
    }

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

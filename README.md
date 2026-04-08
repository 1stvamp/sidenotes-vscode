# Rails Sidenotes

A VS Code extension that displays schema annotations from the [sidenotes](https://github.com/1stvamp/sidenotes-ruby) Ruby gem directly in your editor.

## Features

**CodeLens** above class definitions shows a schema summary with column, index, and association counts. Click it to open a detail panel.

**Hover** over the class name in a model file to see the full schema in a formatted hover card with columns, indexes, and associations.

**Inline decorations** appear as faded text next to attribute references (e.g., `validates :email`) showing type info like `# string, not null`.

**Auto-refresh** watches `.annotations/*.yml` files and updates the display when they change.

**Regenerate command** runs `bundle exec rake sidenotes:generate` in a terminal via the command palette.

## Requirements

- The [sidenotes](https://github.com/1stvamp/sidenotes-ruby) gem installed in your Rails project
- Annotation files generated at `.annotations/` relative to your workspace root

### Generating annotations

Add the gem to your Gemfile:

```ruby
gem 'sidenotes', group: :development
```

Then run:

```sh
bundle exec rake sidenotes:generate
```

Or use the **Rails Sidenotes: Regenerate** command from the VS Code command palette.

## File mapping

The extension maps model files to annotation files by convention:

| Model file | Annotation file |
|---|---|
| `app/models/user.rb` | `.annotations/user.yml` |
| `app/models/admin/setting.rb` | `.annotations/admin/setting.yml` |

## Extension settings

| Setting | Default | Description |
|---|---|---|
| `railsSidenotes.annotationsDir` | `.annotations` | Directory for annotation YAML files |
| `railsSidenotes.showInlineDecorations` | `true` | Show inline type annotations |
| `railsSidenotes.showCodeLens` | `true` | Show CodeLens above class definitions |

## Commands

| Command | Description |
|---|---|
| Rails Sidenotes: Regenerate | Runs `bundle exec rake sidenotes:generate` in a terminal |
| Rails Sidenotes: Show Schema Detail | Opens a detail panel for the current model |

## Annotation file format

The extension reads YAML files with the following structure:

```yaml
---
table_name: users
primary_key: id
columns:
  - name: id
    type: integer
    nullable: false
  - name: email
    type: string
    nullable: false
    default: ""
indexes:
  - name: index_users_on_email
    columns: [email]
    unique: true
associations:
  - type: has_many
    name: posts
    class_name: Post
    foreign_key: user_id
```

## Development

```sh
npm install
npm run compile
# Press F5 in VS Code to launch the Extension Development Host
```

## License

MIT

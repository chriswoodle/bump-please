# Bump Please 🤜💥🤛

A powerful CLI tool for managing version bumps using conventional commits.

For CI/CD integration see: [Bump Please Github Action](https://github.com/chriswoodle/bump-please-action)

## Installation

```bash
npm install -g bump-please
# or
yarn global add bump-please
```

## Usage

Bump Please automatically analyzes your git commits since the last tag and determines the appropriate version bump based loosely on [Conventional Commits](https://www.conventionalcommits.org/) specification.

### Basic Usage

```bash
bump-please bump
```

The tool will:
1. Analyze commits since the last git tag
2. Determine the version bump type (patch, minor, or major)
3. Update version numbers in your `package.json` files
4. Create a git tag with the new version
5. Commit and push the changes

> By default, the root package.json will allways be modified. Add additional configuration to also bump the version of monorepo packages. 
> All package.json files will get the same version.

### Conventional Commits & Version Bumps

Bump Please uses conventional commit messages to determine the version bump type:

#### Patch Version (1.0.0 → 1.0.1)

Patch versions are used for bug fixes and non-breaking changes. Commits with these prefixes trigger a **patch** bump:

- `fix:` - Bug fixes
- `perf:` - Performance improvements
- `refactor:` - Code refactoring
- `docs:` - Documentation changes

**Examples:**
```bash
git commit -m "fix: resolve memory leak in cache"
git commit -m "perf: optimize database queries"
git commit -m "refactor: simplify authentication logic"
git commit -m "docs: update API documentation"
```

#### Minor Version (1.0.0 → 1.1.0)

Minor versions are used for new features that don't break existing functionality. Commits with this prefix trigger a **minor** bump:

- `feat:` - New features

**Examples:**
```bash
git commit -m "feat: add user authentication"
git commit -m "feat(api): implement rate limiting"
git commit -m "feat: add dark mode support"
```

#### Major Version (1.0.0 → 2.0.0)

Major versions are used for breaking changes. Commits that include breaking change indicators trigger a **major** bump:

- `BREAKING CHANGE:` or `BREAKING CHANGES:` in the commit body

**Examples:**
```bash
git commit -m "feat: redesign API" -m "BREAKING CHANGE: API endpoints have changed"
git commit -m "refactor: update data model

BREAKING CHANGES: Database schema has been restructured"
```

### Version Bump Priority

When multiple commit types are present, Bump Please uses the highest priority:
1. **Major** (breaking changes) - highest priority
2. **Minor** (new features)
3. **Patch** (fixes/improvements) - lowest priority

For example, if you have both `feat:` and `fix:` commits, the version will be bumped as **minor**.

### Configuration

Create a `bump-please-config.json` file in your project root:

```json
{
  "packages": [
    {
      "path": "./packages/package-a"
    },
    {
      "path": "./packages/package-b"
    }
  ]
}
```

#### Configuration Options

- `packages` (optional): Array of package paths to update versions for (monorepo support)
- `dryRun` (optional): If `true`, shows what would be changed without making changes
- `disableGitWrites` (optional): If `true`, skips git commits, tags, and pushes
- `gitBranch` (optional): Branch to push to (defaults to current branch)
- `gitCommitterName` (optional): Name for git commits
- `gitCommitterEmail` (optional): Email for git commits
- `githubToken` (optional): GitHub token for authentication (can also use `GITHUB_TOKEN` env var)

### Alternative Output Files

You can specify arbitrary JSON files to update instead of (or in addition to) `package.json`. This is useful for projects like Expo apps that store version information in `app.json`.

**Example: Bumping Expo app.json version**

For an Expo app, the version is typically stored at `expo.version` in `app.json`. Configure it like this:

```json
{
  "packages": [
    {
      "path": ".",
      "jsonFileName": "app.json",
      "jsonPropertyPath": "expo.version"
    }
  ]
}
```

This will update the version in your `app.json` file:
```json
{
  "expo": {
    "name": "MyApp",
    "version": "1.2.3"
  }
}
```

You can combine this with regular `package.json` updates by including multiple package entries in your configuration.

### Command Line Options

```bash
bump-please bump [options]
```

**Options:**
- `--dry-run` - Preview changes without applying them
- `--config-file <path>` - Path to config file (default: `bump-please-config.json`)
- `--disable-git-writes` - Skip git operations
- `--github-token <token>` - GitHub token for authentication
- `--gh-token <token>` - Alternative GitHub token flag
- `--git-branch <branch>` - Branch to push to
- `--git-committer-name <name>` - Git committer name
- `--git-committer-email <email>` - Git committer email
- `--root-package-json <path>` - Path to root package.json (default: `./package.json`)

### Environment Variables

You can also configure the tool using environment variables:

- `DRY_RUN` - Enable dry run mode
- `CONFIG_FILE` - Path to config file
- `DISABLE_GIT_WRITES` - Disable git writes
- `GITHUB_TOKEN` or `GH_TOKEN` - GitHub token
- `GIT_BRANCH` - Git branch
- `GIT_COMMITTER_NAME` - Git committer name
- `GIT_COMMITTER_EMAIL` - Git committer email
- `ROOT_PACKAGE_JSON` - Path to root package.json

### Examples

#### Dry Run

Preview what changes would be made:

```bash
bump-please bump --dry-run
```

#### Monorepo Setup

For a monorepo with multiple packages:

```json
{
  "packages": [
    { "path": "./packages/core" },
    { "path": "./packages/ui" },
    { "path": "./packages/utils" }
  ]
}
```

### How It Works

1. **Tag Detection**: Finds the last semantic version tag (e.g., `v1.2.3`)
2. **Commit Analysis**: Analyzes all commits since the last tag
3. **Version Calculation**: Determines the next version based on conventional commits
4. **Package Updates**: Updates version in root `package.json` and configured packages
5. **Git Operations**: Creates a commit, tags it, and pushes to the remote repository

If no previous tag exists, the tool uses the version from your root `package.json` as the starting point.

## Development
```
yarn install --mode=skip-build
yarn dlx @yarnpkg/sdks vscode
```

## Building and running
```
yarn build
./bump-please/dist/cli.js bump
```

### Credits:

* https://github.com/semrel-extra/zx-semrel

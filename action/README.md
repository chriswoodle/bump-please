# Bump Please GitHub Action 🤜💥🤛

Use [Bump Please](https://github.com/chriswoodle/bump-please) to automatically bump `package.json` versions based on conventional commits. Supports monorepos.

For full configuration options, see [Bump Please](https://github.com/chriswoodle/bump-please).

## Usage

1. Set write permissions so the action can push commits and tags back to the repo.
```yaml
permissions:
  contents: write
```

2. Set `fetch-depth: 0` and `fetch-tags: true` so the action can access all git tags.
```yaml
- uses: actions/checkout@v6
  with:
    fetch-depth: 0
    fetch-tags: true
```

> This may be slow for large repositories. See https://github.com/actions/checkout/issues/1471

3. Add the Bump Please step.
```yaml
- name: 🤜 Bump Please
  uses: chriswoodle/bump-please-action@<commit-sha> # v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

> **Security:** Pin actions to a full commit SHA instead of a mutable tag like `@v1`. Tags can be moved to point to different code, but commit SHAs are immutable. Find the SHA for a release tag with:
> ```bash
> git ls-remote --tags https://github.com/chriswoodle/bump-please-action.git "v*"
> ```

## Full Example

```yaml
name: Version Bump

on:
  push:
    branches: [ main ]

jobs:
  bump:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
    - name: 🏗 Setup repo
      uses: actions/checkout@v6
      with:
        fetch-depth: 0
        fetch-tags: true

    - name: 🏗 Setup Node
      uses: actions/setup-node@v6
      with:
        node-version: 24

    - name: 📦 Install dependencies
      run: npm install

    - name: 🏗️ Build
      run: npm run build

    - name: 🤜 Bump Please
      uses: chriswoodle/bump-please-action@<commit-sha> # v1
      with:
        github-token: ${{ secrets.GITHUB_TOKEN }}
```

## Inputs

| Input | Description | Required |
|---|---|---|
| `github-token` | GitHub token for git operations | No |
| `dry-run` | Preview changes without applying them | No |
| `config-file` | Path to bump-please config file | No |
| `disable-git-writes` | Skip git commits, tags, and pushes | No |
| `git-branch` | Branch to push to | No |
| `git-committer-name` | Name for git commits (default: `github-actions[bot]`) | No |
| `git-committer-email` | Email for git commits | No |
| `root-package-json` | Path to root package.json | No |

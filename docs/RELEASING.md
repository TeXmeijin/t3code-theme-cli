# Releasing

## Validate the checkout

```sh
npm test
npm run check
npm run check:package
git status --short
```

The package check builds a tarball, checks its complete file allowlist, unpacks it, and runs the packaged CLI with isolated settings. It must start with built-in themes only. Personal theme files, imported third-party themes, local history, and import records are not release assets.

Confirm that the Node.js and T3 Code compatibility notes in the README still match the tested versions. Update `package.json` and `CHANGELOG.md` for subsequent releases. Keep GitHub Actions passing on both supported operating systems.

## Publish reviewed commits

The repository is `TeXmeijin/t3code-theme-cli`. After reviewing and committing the changes:

```sh
git push origin main
```

This uploads the committed tree to GitHub. It does not publish to npm. Wait for the CI workflow to pass before creating a release.

## GitHub releases

After the version's CI run passes:

```sh
git tag -a v0.2.0 -m "Release v0.2.0"
git push origin v0.2.0
gh release create v0.2.0 --title "v0.2.0" --notes-file CHANGELOG.md
```

Use the version in `package.json` for the tag and release title. Review the release notes before creating the release. The first release needs no theme bundles or other binary assets.

## npm

npm publication is a separate release decision. The GitHub installation instructions work without it. Before any npm publication, confirm registry ownership and package-name availability against the public npm registry, review `npm pack --dry-run`, and use the organization's chosen release credentials. Do not add credentials or user-specific npm registry configuration to this repository.

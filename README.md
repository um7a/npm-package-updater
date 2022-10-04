# npm-package-updater

![nodejs](https://github.com/um7a/npm-package-updater/actions/workflows/nodejs.yml/badge.svg?branch=main)
![daily_build](https://github.com/um7a/npm-package-updater/actions/workflows/daily_build.yml/badge.svg?branch=main)

This npm package provides a utility to update npm package.

### Install

```
$ npm install -g npm-package-updater
```

### Usage

```
$ npm-package-updater -h

Usage:
  -c, --caret         : Add '^' when update package versions.
  -d, --debug         : Enable debug logging.
  -g, --git           : Execute git commit on package.json change.
  -h, --help          : Show help message.
  -o, --conservative  : Update package versions only if current version range does not contain the new version.
  -p, --commit-prefix : Add prefix to git commit message.
  -r, --dryrun        : Do only check. Don't modify package.json.
  -t, --tilde         : Add '~' when update package versions. Note that this option has priority over --caret.
```

### Example

```
$ npm-package-updater --caret --git --commit-prefix 'deps: ' --conservative
```

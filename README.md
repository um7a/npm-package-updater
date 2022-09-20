# npm-package-updater

![nodejs](https://github.com/um7a/npm-package-updater/actions/workflows/nodejs.yml/badge.svg?branch=main)
![daily_build](https://github.com/um7a/npm-package-updater/actions/workflows/daily_build.yml/badge.svg?branch=main)

This npm package provides a utility to update npm package.

### Install

```bash
$ npm install -g npm-package-updater
```

### Usage

```bash
$ npm-package-updater -h

Usage:
  -d, --debug         : Enable debug logging.
  -r, --dryrun        : Do only check. Don't modify package.json.
  -h, --help          : Show help message.
  -c, --caret         : Add '^' when update package versions.
  -t, --tilde         : Add '~' when update package versions. Note that this option has priority over --caret.
  -g, --git           : Execute git commit on package.json change.
  -p, --commit-prefix : Add prefix to git commit message.
```

### Example

```bash
$ npm-package-updater --caret --git --commit-prefix 'deps: '
```

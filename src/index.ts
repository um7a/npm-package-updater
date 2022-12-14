import { Arguments, ruleType } from './arguments';
import Logger from './logger';
import { NpmPackageUpdater, NpmPackageUpdaterParam } from './npmPackageUpdater';

export default function main() {
  const argRules: ruleType[] = [
    {
      shortKey: 'c',
      longKey: 'caret',
      type: 'boolean',
      description: "Add '^' when update package versions.",
    },
    {
      shortKey: 'd',
      longKey: 'debug',
      type: 'boolean',
      description: 'Enable debug logging.',
    },
    {
      shortKey: 'g',
      longKey: 'git',
      type: 'boolean',
      description: 'Execute git commit on package.json change.',
    },
    {
      shortKey: 'h',
      longKey: 'help',
      type: 'boolean',
      description: 'Show help message.',
    },
    {
      shortKey: 'o',
      longKey: 'conservative',
      type: 'boolean',
      description:
        'Update package versions only if current version range does not contain the new version.',
    },
    {
      shortKey: 'p',
      longKey: 'commit-prefix',
      type: 'string',
      description: 'Add prefix to git commit message.',
    },
    {
      shortKey: 'r',
      longKey: 'dryrun',
      type: 'boolean',
      description: "Do only check. Don't modify package.json.",
    },
    {
      shortKey: 't',
      longKey: 'tilde',
      type: 'boolean',
      description:
        "Add '~' when update package versions. Note that this option has priority over --caret.",
    },
  ];

  const args = new Arguments(argRules, process.argv);
  const helpOption = args.getBoolean('help');
  if (helpOption.found && helpOption.values[0] === true) {
    // eslint-disable-next-line no-console
    console.log(args.generateHelp());
    return;
  }

  const npmPackageUpdaterParam: NpmPackageUpdaterParam = {
    dryrun: false,
    logger: new Logger('info', true),
    setCaret: false,
    setTilde: false,
    useGit: false,
    commitPrefix: '',
    conservative: false,
  };

  const debugOption = args.getBoolean('debug');
  if (debugOption.found && debugOption.values[0] === true) {
    npmPackageUpdaterParam.logger = new Logger('debug', true);
  }

  const dryrunOption = args.getBoolean('dryrun');
  if (dryrunOption.found && dryrunOption.values[0] === true) {
    npmPackageUpdaterParam.dryrun = true;
  }

  const caretOption = args.getBoolean('caret');
  if (caretOption.found && caretOption.values[0] === true) {
    npmPackageUpdaterParam.setCaret = true;
  }

  const tildeOption = args.getBoolean('tilde');
  if (tildeOption.found && tildeOption.values[0] === true) {
    npmPackageUpdaterParam.setTilde = true;
  }

  const useGitOption = args.getBoolean('git');
  if (useGitOption.found && useGitOption.values[0] === true) {
    npmPackageUpdaterParam.useGit = true;
  }

  const commitPrefixOption = args.getString('commit-prefix');
  if (commitPrefixOption.found) {
    [npmPackageUpdaterParam.commitPrefix] = commitPrefixOption.values;
  }

  const conservativeOption = args.getBoolean('conservative');
  if (conservativeOption.found && conservativeOption.values[0] === true) {
    npmPackageUpdaterParam.conservative = true;
  }

  const npmPackageUpdater = new NpmPackageUpdater(npmPackageUpdaterParam);
  npmPackageUpdater.update('dependencies');
  npmPackageUpdater.update('devDependencies');
}

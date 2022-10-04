import semver from 'semver';

import { existsSync } from 'fs';
import Logger from './logger';
import NpmCommandWrapper from './npmCommandWrapper';
import GitCommandWrapper from './gitCommandWrapper';
import PackageJsonAccessor from './packageJsonAccessor';

type PkgInfo = {
  current: string;
  latest: string;
  available: string[];
  dependsOn: Map<string, string>;
  isDependedBy: Map<string, string>;
  updateCandidate?: string;
  updateVersion?: string;
};

export type NpmPackageUpdaterParam = {
  dryrun: boolean;
  logger: Logger;
  setCaret: boolean;
  setTilde: boolean;
  useGit: boolean;
  commitPrefix: string;
  conservative: boolean;
};

export class NpmPackageUpdater {
  private dryrun: boolean;

  private logger: Logger;

  private setCaret: boolean;

  private setTilde: boolean;

  private useGit: boolean;

  private commitPrefix: string;

  private conservative: boolean;

  private packageJsonAccessor: PackageJsonAccessor;

  private static ensurePackageJsonExists() {
    if (!existsSync('./package.json')) {
      throw new Error('package.json was not found.');
    }
  }

  private getDependencies(
    dependenciesName: 'dependencies' | 'devDependencies',
  ) {
    if (dependenciesName === 'dependencies') {
      return this.packageJsonAccessor.getDependencies();
    }
    return this.packageJsonAccessor.getDevDependencies();
  }

  private createPackages(
    dependenciesName: 'dependencies' | 'devDependencies',
    dependencies: { [pkgName: string]: string | undefined },
  ) {
    const depPkgInfoList: Map<string, PkgInfo> = new Map();

    Object.entries(dependencies).forEach(([pkgName, currentVersion]) => {
      if (typeof currentVersion === 'undefined') {
        throw new Error(`Failed to get current version of ${pkgName}.`);
      }
      this.logger.debug(
        `Execute 'npm info ${pkgName}' to get dependencies information.`,
      );
      const npmInfo = NpmCommandWrapper.info(pkgName);
      this.logger.debug(npmInfo);

      // Check if this dependency package has peerDependencies,
      // and the peerDependencies is also in dependencies.
      const dependsOn: Map<string, string> = new Map();
      if (typeof npmInfo.peerDependencies !== 'undefined') {
        this.logger.debug(`${pkgName} has peerDependencies.`);
        const pkgNames = Object.keys(dependencies);
        Object.entries(npmInfo.peerDependencies).forEach(
          ([peerDepPkgName, acceptableVersion]) => {
            this.logger.debug(
              `Check that ${peerDepPkgName} (peerDependency of ${pkgName}) is also in ${dependenciesName}.`,
            );
            const peerDepIsOtherDep = pkgNames.some(
              (otherDepPkgName) => otherDepPkgName === peerDepPkgName,
            );
            if (peerDepIsOtherDep) {
              this.logger.debug(
                `${peerDepPkgName} is also in ${dependenciesName}.`,
              );
              dependsOn.set(peerDepPkgName, acceptableVersion);
            } else {
              this.logger.debug(
                `${peerDepPkgName} is not in ${dependenciesName}.`,
              );
            }
          },
        );
      }

      depPkgInfoList.set(pkgName, {
        current: currentVersion,
        latest: npmInfo.version,
        available: npmInfo.versions,
        dependsOn,
        isDependedBy: new Map(), // This field will be filled by the following logic.
      });
    });

    // Fill isDependedBy field.
    depPkgInfoList.forEach((pkgInfo, pkgName) => {
      const { dependsOn } = pkgInfo;
      // for (const [dependsPkgName, requiredVersion] of dependsOn.entries()) {
      dependsOn.forEach((requiredVersion, dependsPkgName) => {
        const peerDepPkgInfo = depPkgInfoList.get(dependsPkgName);
        if (typeof peerDepPkgInfo === 'undefined') {
          throw new Error(
            `${dependsPkgName} should be in ${dependenciesName}. But not found.`,
          );
        }
        peerDepPkgInfo.isDependedBy.set(pkgName, requiredVersion);
      });
    });
    return depPkgInfoList;
  }

  // The following functions create dependency trees like the following.
  //
  //   (Tree1)            (Tree2)
  //
  //     pkgA               pkgA
  //                         ^
  //                         | (depends on)
  //                        pkgB
  //
  //
  //   (Tree3)              (Tree4)
  //
  //     pkgA     pkgB        pkgA
  //      ^        ^           ^
  //      |        |           | (depends on)
  //      +--------+           +--------+
  //      | (depends on)       |        |
  //     pkgC                 pkgB     pkgC
  //
  //
  //   (Tree5)
  //
  //     pkgA <------------+
  //      ^                |
  //      | (depends on)   |
  //      |                |
  //     pkgB              | (depends on)
  //      ^                |
  //      | (depends on)   |
  //      |                |
  //     pkgC -------------+
  //
  private addPkgToPkgGroup(
    depPkgs: Map<string, PkgInfo>,
    rootPkgName: string,
    pkgGroup: Map<string, PkgInfo>,
  ) {
    const rootPkgInfo = depPkgs.get(rootPkgName);
    if (rootPkgInfo === undefined) {
      throw new Error(`${rootPkgName} should be in depPkgList. But not found.`);
    }
    pkgGroup.set(rootPkgName, rootPkgInfo);

    // Go to next tree node
    rootPkgInfo.isDependedBy.forEach((_, nextPkgName) => {
      this.addPkgToPkgGroup(depPkgs, nextPkgName, pkgGroup);
    });
  }

  private createPkgGroups(
    depPkgs: Map<string, PkgInfo>,
    allPkgGroups: Map<string, PkgInfo>[],
  ) {
    // for (const [pkgName, pkgInfo] of depPkgs) {
    depPkgs.forEach((pkgInfo, pkgName) => {
      // Find root package (the package which does not depend on other package) from depPkgs.
      if (pkgInfo.dependsOn.size > 0) {
        return;
      }
      this.logger.debug(
        `Create the package group whose root node is ${pkgName}.`,
      );
      const pkgGroup = new Map();
      this.addPkgToPkgGroup(depPkgs, pkgName, pkgGroup);
      allPkgGroups.push(pkgGroup);

      this.logger.debug(
        `Created the package group whose root node is ${pkgName} successfully.`,
      );
      this.logger.debug('package group is the following.');
      this.logger.debug(pkgGroup);
    });
  }

  private updatePkgGroup(
    allPkgGroups: Map<string, PkgInfo>[],
    pkgGroup: Map<string, PkgInfo>,
    pkgName: string,
    candidateIsTooHigh?: boolean,
    acceptableVersion?: string,
  ) {
    const pkg = pkgGroup.get(pkgName);
    if (typeof pkg === 'undefined') {
      throw new Error(`${pkgName} should be in package group. But not found.`);
    }

    this.logger.debug(`Select the candidate for update of ${pkgName}.`);
    if (typeof pkg.updateCandidate === 'undefined') {
      // First time selection of update candidate
      this.logger.debug(
        'No candidate version has been set yet. This is the first time to select.',
      );
      this.logger.debug('Set the latest version to the candidate.');
      pkg.updateCandidate = pkg.latest;
      this.logger.debug(`Set the candidate version to ${pkg.updateCandidate}.`);
    } else if (candidateIsTooHigh) {
      this.logger.debug(
        'The candidate version has been set. But the version is too high. Lower the version.',
      );
      // Find current candidate version from all available versions.
      // Note that array.prototype.findLast does not exist in node.js. So find manually.
      let currentCandidateIndex: number | undefined;
      for (let i = pkg.available.length - 1; i >= 0; i -= 1) {
        if (pkg.updateCandidate === pkg.available[i]) {
          currentCandidateIndex = i;
          break;
        }
      }

      if (currentCandidateIndex === undefined) {
        throw new Error(`The candidate of ${pkgName} was not found.`);
      }

      // The current candidate is the oldest version of depPkg. No more candidates.
      if (currentCandidateIndex === 0) {
        throw new Error(
          `The candidate of ${pkgName} is the oldest version. No more older version. Candidate was not found.`,
        );
      }

      // Set next update candidate.
      this.logger.debug(`Find the next candidate of ${pkgName}.`);
      if (acceptableVersion) {
        for (let i = currentCandidateIndex - 1; i >= 0; i -= 1) {
          const nextUpdateCandidate = pkg.available[i];
          if (semver.satisfies(nextUpdateCandidate, acceptableVersion)) {
            pkg.updateCandidate = nextUpdateCandidate;
            break;
          }
          if (i === 0) {
            throw new Error(`Candidate of ${pkgName} was not found.`);
          }
        }
      } else {
        pkg.updateCandidate = pkg.available[currentCandidateIndex - 1];
      }
      this.logger.debug(`Set candidate version to ${pkg.updateCandidate}.`);
    } else {
      this.logger.debug('The candidate version has been already set.');
    }

    // Get candidate version's package info.
    const pkgNameWithVersion = `${pkgName}@${pkg.updateCandidate}`;
    const npmInfo = NpmCommandWrapper.info(pkgNameWithVersion);

    // Check acceptable version range of the dependency packages.
    // eslint-disable-next-line no-restricted-syntax
    for (const depPkgName of pkg.dependsOn.keys()) {
      this.logger.debug(`${pkgNameWithVersion} depends on ${depPkgName}.`);
      const acceptableVersionOfDep = npmInfo.peerDependencies[depPkgName];
      if (acceptableVersionOfDep === undefined) {
        throw new Error(
          `${depPkgName} should be the peerDependency of ${pkgNameWithVersion}. `
            + `But failed to get acceptable version from npm info ${pkgNameWithVersion}.`,
        );
      }
      this.logger.debug(
        `The accepted version range of ${depPkgName} for ${pkgNameWithVersion} is ${acceptableVersionOfDep}.`,
      );

      // Check if updateCandidate of depPkg matches with acceptableVersion.
      const depPkg = pkgGroup.get(depPkgName);
      if (depPkg === undefined) {
        // Note:
        // In this case, depPkg is in deferent tree. And this is the first time to update depPkg.
        // So depPkg has not been updated yet. It's ok to skip checking.
        // Because it should be updated later.
        //
        // This can happen when the package group is like the following.
        //
        // Current package group     Other package group
        //
        //      PkgA (root)                PkgC (root) (depPkg)
        //       ^                          ^
        //       |                          |
        //      PkgB (pkg)                 PkgB (pkg)
        //
        this.logger.debug(
          `${depPkgName} does not exist in current package group. It is checked in deferent package group.`,
        );
        continue;
      }
      if (depPkg.updateCandidate === undefined) {
        // Note:
        // In this case, depPkg is in the same package group, But it has not been updated yet.
        // This can happen when the package group is like the following and the update is
        // executed in the order of PkgA (root package), C (pkg), B (depPkg).
        //
        //               PkgA <--+
        //                ^      |
        //  (depends on)  |      |
        //               PkgB    | (depends on)
        //                ^      |
        //  (depends on)  |      |
        //               PkgC - -+
        //
        //       I should update depPkg (in this case, PkgB) first.
        this.logger.debug(
          `${depPkgName} exists in package group. But it's candidate version has not been selected. I will select ${depPkgName} first.`,
        );
        pkg.updateCandidate = undefined;
        return;
      }

      this.logger.debug(
        `${depPkgName}'s candidate version is ${depPkg.updateCandidate}.`,
      );
      const depPkgNameWithVersion = `${depPkgName}@${depPkg.updateCandidate}`;
      if (semver.satisfies(depPkg.updateCandidate, acceptableVersionOfDep)) {
        this.logger.debug(
          `${pkgNameWithVersion} can use ${depPkgNameWithVersion}.`,
        );
        continue;
      }
      this.logger.debug(
        `${pkgNameWithVersion} can not use dependency ${depPkgNameWithVersion}.`,
      );
      const acceptableMinVersionOfDep = semver.minVersion(
        acceptableVersionOfDep,
      );
      if (acceptableMinVersionOfDep === null) {
        throw new Error(
          `Failed to calculate the min version of ${depPkgName} from ${acceptableMinVersionOfDep}.`,
        );
      }

      if (semver.lt(depPkg.updateCandidate, acceptableMinVersionOfDep)) {
        // Lower the version of depPkg.
        this.logger.debug(
          `The version of ${pkgName} is too high. Try to lower the version of ${pkgName}.`,
        );
        this.updatePkgGroup(allPkgGroups, pkgGroup, pkgName, true);
        return;
      }
      // Note:
      // This case indicates that the version of depPkg is too low or
      // the version of depDepPackage is too high.
      // I can't increase the version of depPkg.
      // Because the selection of candidate version of depPkg starts from latest,
      // and some dependency lower the version if needed.
      // Increasing the version of depPkg will causes infinity loop.
      this.logger.debug(
        `The version of ${depPkgName} is too high. Try to lower the version of ${depPkgName}.`,
      );

      this.updatePkgGroup(
        allPkgGroups,
        pkgGroup,
        depPkgName,
        true,
        acceptableVersionOfDep,
      );
      return;
    }

    // If the candidate which had already been selected was changed,
    // It need to check again the other trees which contain this package.
    if (candidateIsTooHigh) {
      this.logger.debug(
        `The candidate version for ${pkgName} which had already been selected was changed. Recheck other package groups which contains this package if exist.`,
      );
      // Find package group which contains depPkg.
      allPkgGroups.forEach((otherPkgGroup) => {
        // eslint-disable-next-line no-restricted-syntax
        for (const otherPkgGroupPkgName of otherPkgGroup.keys()) {
          if (otherPkgGroupPkgName === pkgName) {
            // Check that otherPkgGroup is current pkgGroup or not.
            const isSamePkgGroup = (
              pkgGroup1: Map<string, PkgInfo>,
              pkgGroup2: Map<string, PkgInfo>,
            ) => {
              if (pkgGroup1.size !== pkgGroup2.size) {
                return false;
              }
              // eslint-disable-next-line no-restricted-syntax
              for (const pkgNameOfPkgGroup1 of pkgGroup1.keys()) {
                if (pkgGroup2.has(pkgNameOfPkgGroup1) === false) {
                  return false;
                }
              }
              return true;
            };

            if (isSamePkgGroup(pkgGroup, otherPkgGroup)) {
              break;
            }

            this.logger.debug(
              `The package group contains ${pkgName} is found. Recheck this tree.`,
            );

            this.updatePkgGroup(allPkgGroups, pkgGroup, pkgName);
            this.logger.debug('Rechecked the package group Successfully.');
            break;
          }
        }
      });
      this.logger.debug('Rechecked other package groups successfully.');
    }

    this.logger.debug(`Selected candidate version of ${pkgName} successfully.`);

    // Go to next package.
    pkg.isDependedBy.forEach((_, nextPkgName) => {
      this.logger.debug(
        `Select the candidate version of next package ${nextPkgName}. this depends on ${pkgName}.`,
      );
      this.updatePkgGroup(allPkgGroups, pkgGroup, nextPkgName);
    });
  }

  private updatePkgGroups(allPkgGroups: Map<string, PkgInfo>[]) {
    allPkgGroups.forEach((pkgGroup) => {
      // Find root node.
      // eslint-disable-next-line no-restricted-syntax
      for (const [pkgName, pkgInfo] of pkgGroup.entries()) {
        if (pkgInfo.dependsOn.size === 0) {
          this.logger.debug(
            `Update package group whose root node is ${pkgName}.`,
          );

          this.updatePkgGroup(allPkgGroups, pkgGroup, pkgName);
          this.logger.debug(
            `Updated package group whose root node is ${pkgName} successfully.`,
          );
          this.logger.debug(pkgGroup);
          break;
        }
      }
    });
  }

  private logUpdatePlan(
    dependenciesName: string,
    updatePkgs: Map<string, PkgInfo>,
  ) {
    this.logger.info(`Update ${dependenciesName} to the following version.`);
    updatePkgs.forEach((pkgInfo, pkgName) => {
      this.logger.info(
        `* ${pkgName}: ${pkgInfo.current} -> ${pkgInfo.updateVersion}`,
      );
    });
  }

  private applyUpdate(
    dependenciesName: 'dependencies' | 'devDependencies',
    pkgName: string,
    pkgInfo: PkgInfo,
    allUpdatePkgs: Map<string, PkgInfo>,
    updatedPkgs?: Map<string, PkgInfo>,
  ) {
    const dependencies = this.getDependencies(dependenciesName);
    if (typeof dependencies === 'undefined') {
      this.logger.warn(
        `${dependenciesName} was not found in package.json. Skip updating of ${dependenciesName}.`,
      );
      return;
    }
    const currentVersion = dependencies[pkgName];
    if (typeof currentVersion === 'undefined') {
      this.logger.warn(
        `Failed to get current version of ${pkgName}. Skip updating of ${pkgName}.`,
      );
      return;
    }
    if (typeof pkgInfo.updateVersion === 'undefined') {
      this.logger.debug(
        `Update version of ${pkgName} is undefined. It must a bug. Skip updating of ${pkgName}.`,
      );
      return;
    }
    if (currentVersion === pkgInfo.updateVersion) {
      this.logger.debug(
        `${pkgName} has already been updated by other updated packages. Skip updating.`,
      );
      return;
    }
    this.logger.debug(
      `Update ${pkgName} from ${pkgInfo.current} to ${pkgInfo.updateVersion}.`,
    );
    this.packageJsonAccessor.setVersion(pkgName, pkgInfo.updateVersion);
    this.logger.debug('Updated successfully');

    const isDependencyUpdate = typeof updatedPkgs !== 'undefined';
    if (typeof updatedPkgs === 'undefined') {
      // eslint-disable-next-line no-param-reassign
      updatedPkgs = new Map<string, PkgInfo>();
    }
    updatedPkgs.set(pkgName, pkgInfo);

    if (pkgInfo.dependsOn.size > 0) {
      this.logger.debug(`Update the packages which ${pkgName} depends on.`);
      // eslint-disable-next-line no-restricted-syntax
      for (const depPkgName of pkgInfo.dependsOn.keys()) {
        const depPkgInfo = allUpdatePkgs.get(depPkgName);
        if (typeof depPkgInfo === 'undefined') {
          this.logger.debug(
            `${pkgName} depends on ${depPkgName}. But ${depPkgName} need no update.`,
          );
          continue;
        }
        this.applyUpdate(
          dependenciesName,
          depPkgName,
          depPkgInfo,
          allUpdatePkgs,
          updatedPkgs,
        );
      }
      this.logger.debug(
        `Updated the packages which ${pkgName} depends on successfully.`,
      );
    }

    if (pkgInfo.isDependedBy.size > 0) {
      this.logger.debug(`Update the packages which depends on ${pkgName}.`);
      // eslint-disable-next-line no-restricted-syntax
      for (const depPkgName of pkgInfo.isDependedBy.keys()) {
        const depPkgInfo = allUpdatePkgs.get(depPkgName);
        if (typeof depPkgInfo === 'undefined') {
          this.logger.debug(
            `${depPkgName} depends on ${pkgName}. But ${depPkgName} need no update.`,
          );
          continue;
        }
        this.applyUpdate(
          dependenciesName,
          depPkgName,
          depPkgInfo,
          allUpdatePkgs,
          updatedPkgs,
        );
      }
      this.logger.debug(
        `Updated the packages which depends on ${pkgName} successfully.`,
      );
    }

    if (isDependencyUpdate) {
      return;
    }

    if (!this.useGit) {
      return;
    }

    this.logger.debug('Commit update.');
    const commitMsgs: string[] = [];
    updatedPkgs.forEach((updatedPkgInfo, updatedPkgName) => {
      commitMsgs.push(
        `${updatedPkgName} from ${updatedPkgInfo.current} to ${updatedPkgInfo.updateVersion}`,
      );
    });
    let commitMsg = this.commitPrefix
      ? `${this.commitPrefix}Update `
      : 'Update ';
    for (let i = 0; i < commitMsgs.length; i++) {
      commitMsg += commitMsgs[i];
      if (i !== commitMsgs.length - 1) {
        commitMsg += ', ';
      }
    }
    GitCommandWrapper.add('./package.json');
    GitCommandWrapper.commit(commitMsg);
  }

  private applyUpdates(
    dependenciesName: 'dependencies' | 'devDependencies',
    updatePkgs: Map<string, PkgInfo>,
  ) {
    this.logger.debug('Update package.json.');
    updatePkgs.forEach((pkgInfo, pkgName) => {
      this.applyUpdate(dependenciesName, pkgName, pkgInfo, updatePkgs);
    });
  }

  constructor(param: NpmPackageUpdaterParam) {
    this.dryrun = param.dryrun;
    this.logger = param.logger;
    this.setCaret = param.setCaret;
    this.setTilde = param.setTilde;
    this.useGit = param.useGit;
    this.commitPrefix = param.commitPrefix;
    this.conservative = param.conservative;

    NpmPackageUpdater.ensurePackageJsonExists();
    this.packageJsonAccessor = new PackageJsonAccessor('./package.json');
  }

  update(dependenciesName: 'dependencies' | 'devDependencies') {
    this.logger.debug('Start npm package updater.');

    this.logger.debug('Get dependencies.');
    const dependencies = this.getDependencies(dependenciesName);
    this.logger.debug('Got dependencies successfully.');
    if (typeof dependencies === 'undefined') {
      this.logger.info(`${dependenciesName} was not found in package.json.`);
      return;
    }

    this.logger.debug('Create package information.');
    const depPkgs = this.createPackages(dependenciesName, dependencies);
    this.logger.debug('Created package information successfully.');

    this.logger.debug('Create package groups based on dependsOn fields.');
    const allPkgGroups: Map<string, PkgInfo>[] = [];
    this.createPkgGroups(depPkgs, allPkgGroups);
    this.logger.debug('Created package groups successfully.');

    this.logger.debug('Update package groups.');
    this.updatePkgGroups(allPkgGroups);
    this.logger.debug('Updated package groups successfully.');

    this.logger.debug('Handle setCaret and setTilde options.');
    depPkgs.forEach((pkgInfo) => {
      if (pkgInfo.current === pkgInfo.updateCandidate) {
        // eslint-disable-next-line no-param-reassign
        pkgInfo.updateVersion = pkgInfo.current;
        return;
      }
      if (this.setTilde) {
        if (!pkgInfo.updateCandidate?.startsWith('~')) {
          // eslint-disable-next-line no-param-reassign
          pkgInfo.updateVersion = `~${pkgInfo.updateCandidate}`;
        }
      } else if (this.setCaret) {
        if (!pkgInfo.updateCandidate?.startsWith('^')) {
          // eslint-disable-next-line no-param-reassign
          pkgInfo.updateVersion = `^${pkgInfo.updateCandidate}`;
        }
      } else {
        // eslint-disable-next-line no-param-reassign
        pkgInfo.updateVersion = pkgInfo.updateCandidate;
      }
    });

    if (this.conservative) {
      this.logger.debug('Handle conservative option.');
      depPkgs.forEach((pkgInfo, pkgName) => {
        if (
          pkgInfo.updateVersion
          && pkgInfo.updateVersion === pkgInfo.current
        ) {
          return;
        }

        if (
          pkgInfo.updateCandidate
          && semver.satisfies(pkgInfo.updateCandidate, pkgInfo.current)
        ) {
          this.logger.info(
            `Current version of ${pkgName} ${pkgInfo.current} contains update version ${pkgInfo.updateCandidate}. Skip updating.`,
          );
          // eslint-disable-next-line no-param-reassign
          pkgInfo.updateVersion = pkgInfo.current;
        }
      });
      this.logger.debug('Handle conservative option successfully.');
    }

    this.logger.debug('Handled setCaret and setTilde options successfully.');

    this.logger.debug('Check if the packages to be updated exist.');
    const updatePkgs = new Map<string, PkgInfo>();
    depPkgs.forEach((pkgInfo, pkgName) => {
      if (pkgInfo.current !== pkgInfo.updateVersion) {
        updatePkgs.set(pkgName, pkgInfo);
      }
    });
    if (updatePkgs.size === 0) {
      this.logger.info(`${dependenciesName} need no update.`);
      return;
    }

    this.logUpdatePlan(dependenciesName, updatePkgs);

    if (this.dryrun) {
      this.logger.notice('dryrun mode is set. Skip changing package.json.');
      return;
    }
    this.applyUpdates(dependenciesName, updatePkgs);

    this.logger.debug('Finish npm package updater.');
  }
}

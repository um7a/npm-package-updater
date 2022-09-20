import { execSync } from 'child_process';

type NpmInfo = {
  version: string;
  versions: string[];
  peerDependencies: {
    [pkgName: string]: string;
  };
};

function validateDependencies(dependencies: any) {
  if (typeof dependencies === 'undefined') {
    return;
  }
  if (typeof dependencies !== 'object' || dependencies === null) {
    throw new Error(`Invalid dependencies': ${dependencies}`);
  }
  Object.entries(dependencies).forEach(([pkgName, pkgVersion]) => {
    if (typeof pkgName !== 'string') {
      throw new Error(`Invalid dependencies': package name = ${pkgName}`);
    }
    if (typeof pkgVersion !== 'string') {
      throw new Error(
        `Invalid dependencies': package name = ${pkgName}, version = ${pkgVersion}`,
      );
    }
  });
}

export default {
  info(pkgName: string) {
    const cmd = `npm info ${pkgName} --json`;
    const stdout = execSync(cmd);
    const stdoutObj = JSON.parse(stdout.toString());
    if (typeof stdoutObj === 'undefined') {
      throw new Error(`Stdout of ${cmd} is undefined.`);
    }
    // Validate version
    if (typeof stdoutObj.version !== 'string') {
      throw new Error(
        `Invalid output of '${cmd}': version = ${stdoutObj.version}`,
      );
    }
    // Validate versions
    if (!Array.isArray(stdoutObj.versions)) {
      throw new Error(
        `Invalid output of '${cmd}': versions = ${stdoutObj.versions}`,
      );
    }
    stdoutObj.versions.forEach((version: any) => {
      if (typeof version !== 'string') {
        throw new Error(
          `Invalid output of '${cmd}': element of versions = ${version}`,
        );
      }
    });
    validateDependencies(stdoutObj.peerDependencies);

    const npmInfo: NpmInfo = {
      version: stdoutObj.version,
      versions: stdoutObj.versions,
      peerDependencies: stdoutObj.peerDependencies,
    };

    return npmInfo;
  },

  install() {
    execSync('npm install');
  },
};

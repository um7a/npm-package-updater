import { execSync } from "child_process";

type NpmList = {
  version: string;
  name: string;
  dependencies: {
    [key: string]: {
      version: string;
      resolved: string;
    };
  };
};

type NpmInfo = {
  version: string;
  versions: string[];
  peerDependencies: {
    [pkgName: string]: string;
  };
};

function validateDependencies(dependencies: any) {
  if (typeof dependencies === "undefined") {
    return;
  }
  if (typeof dependencies !== "object" || dependencies === null) {
    throw new Error(`Invalid dependencies': ${dependencies}`);
  }
  for (const [pkgName, pkgVersion] of Object.entries(dependencies)) {
    if (typeof pkgName !== "string") {
      throw new Error(`Invalid dependencies': package name = ${pkgName}`);
    }
    if (typeof pkgVersion !== "string") {
      throw new Error(
        `Invalid dependencies': package name = ${pkgName}, version = ${pkgVersion}`
      );
    }
  }
}

export const NpmCommandWrapper = {
  info(pkgName: string) {
    const cmd = `npm info ${pkgName} --json`;
    const stdout = execSync(cmd);
    const stdoutObj = JSON.parse(stdout.toString());
    if (typeof stdoutObj === "undefined") {
      throw new Error(`Stdout of ${cmd} is undefined.`);
    }
    // Validate version
    if (typeof stdoutObj.version !== "string") {
      throw new Error(
        `Invalid output of '${cmd}': version = ${stdoutObj.version}`
      );
    }
    // Validate versions
    if (!Array.isArray(stdoutObj.versions)) {
      throw new Error(
        `Invalid output of '${cmd}': versions = ${stdoutObj.versions}`
      );
    }
    stdoutObj.versions.forEach((version: any) => {
      if (typeof version !== "string") {
        throw new Error(
          `Invalid output of '${cmd}': element of versions = ${version}`
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

  list(): NpmList {
    const cmd = "npm list --json";
    const stdout = execSync(cmd);
    // Note that stdoutObj should follow the format below.
    // {
    //   version: '<version>',
    //   name: '<package name>',
    //   dependencies: {
    //     '<package name>': {
    //       version: '<version>',
    //       resolved: '<url>',
    //     },
    //     ...
    //   }
    // }
    const stdoutObj = JSON.parse(stdout.toString());
    if (typeof stdoutObj === "undefined") {
      throw new Error(`Stdout of ${cmd} is undefined.`);
    }
    // Check format of version
    if (typeof stdoutObj.version !== "string") {
      throw new Error(
        `Invalid output of '${cmd}': version = ${stdoutObj.version}`
      );
    }
    // Check format of name
    if (typeof stdoutObj.name !== "string") {
      throw new Error(`Invalid output of '${cmd}': name = ${stdoutObj.name}`);
    }
    // Check format of dependencies
    if (
      typeof stdoutObj.dependencies !== "object" ||
      stdoutObj.dependencies === null
    ) {
      throw new Error(
        `Invalid output of '${cmd}': dependencies = ${stdoutObj.dependencies}`
      );
    }
    for (const [key, value] of Object.entries(stdoutObj.dependencies)) {
      if (typeof value !== "object" || value === null) {
        throw new Error(
          `Invalid output of '${cmd}': dependencies.${key} = ${value}`
        );
      }
      if (typeof (value as { version: any }).version !== "string") {
        const version = (value as { version: any }).version;
        throw new Error(
          `Invalid output of '${cmd}': dependencies.${key}.version = ${version}`
        );
      }
      if (typeof (value as { resolved: any }).resolved !== "string") {
        const resolved = (value as { resolved: any }).resolved;
        throw new Error(
          `Invalid output of '${cmd}': dependencies.${key}.resolved = ${resolved}`
        );
      }
    }
    return stdoutObj as NpmList;
  },

  install() {
    execSync("npm install");
  },
};

import { readFileSync, writeFileSync } from 'fs';

type PackageJson = {
  dependencies: {
    [key: string]: string | undefined;
  };
  devDependencies: {
    [key: string]: string | undefined;
  };
};

export default class PackageJsonAccessor {
  private packageJson;

  private packageJsonPath: string;

  private static isValidDependency(dependencies: any) {
    if (typeof dependencies === 'undefined') {
      return true;
    }
    if (typeof dependencies !== 'object' || dependencies === null) {
      return false;
    }
    // eslint-disable-next-line no-restricted-syntax
    for (const [pkgName, pkgVersion] of Object.entries(dependencies)) {
      if (typeof pkgName !== 'string') {
        return false;
      }
      if (typeof pkgVersion !== 'string') {
        return false;
      }
    }
    return true;
  }

  constructor(packageJsonPath: string) {
    this.packageJsonPath = packageJsonPath;
    const pkgJson = JSON.parse(readFileSync(packageJsonPath).toString());
    if (typeof pkgJson !== 'object' || pkgJson === null) {
      throw new Error(`Invalid package.json: ${pkgJson}`);
    }
    // Validate dependencies
    const { dependencies } = pkgJson;
    if (!PackageJsonAccessor.isValidDependency(dependencies)) {
      throw new Error('Invalid package.json. dependencies is invalid.');
    }
    const { devDependencies } = pkgJson;
    if (!PackageJsonAccessor.isValidDependency(devDependencies)) {
      throw new Error('Invalid package.json. devDependencies is invalid.');
    }
    this.packageJson = pkgJson as PackageJson;
  }

  getDependencies() {
    return this.packageJson.dependencies;
  }

  getDevDependencies() {
    return this.packageJson.devDependencies;
  }

  getVersion(packageName: string) {
    if (this.packageJson.devDependencies !== undefined) {
      // eslint-disable-next-line no-restricted-syntax
      for (const [name, version] of Object.entries(
        this.packageJson.devDependencies,
      )) {
        if (name === packageName) {
          return version;
        }
      }
    }
    if (this.packageJson.dependencies !== undefined) {
      // eslint-disable-next-line no-restricted-syntax
      for (const [name, version] of Object.entries(
        this.packageJson.dependencies,
      )) {
        if (name === packageName) {
          return version;
        }
      }
    }
    return undefined;
  }

  setVersion(packageName: string, version: string) {
    let packageIsFound = false;
    if (this.packageJson.devDependencies !== undefined) {
      // eslint-disable-next-line no-restricted-syntax
      for (const name of Object.keys(this.packageJson.devDependencies)) {
        if (name === packageName) {
          this.packageJson.devDependencies[name] = version;
          packageIsFound = true;
          break;
        }
      }
    }
    if (this.packageJson.dependencies !== undefined) {
      // eslint-disable-next-line no-restricted-syntax
      for (const name of Object.keys(this.packageJson.dependencies)) {
        if (name === packageName) {
          this.packageJson.dependencies[name] = version;
          packageIsFound = true;
          break;
        }
      }
    }
    if (!packageIsFound) {
      throw new Error(`Package ${packageName} was not found in package.json.`);
    }
    writeFileSync(
      this.packageJsonPath,
      JSON.stringify(this.packageJson, undefined, 2),
    );
  }
}

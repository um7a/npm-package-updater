import { execSync } from "child_process";

export const GitCommandWrapper = {
  add(filePath: string) {
    const cmd = `git add ${filePath}`;
    execSync(cmd);
  },

  commit(commitMsg: string) {
    const cmd = `git commit -m "${commitMsg}"`;
    execSync(cmd);
  },
};

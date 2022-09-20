import { execSync } from 'child_process';

export default {
  add(filePath: string) {
    const cmd = `git add ${filePath}`;
    execSync(cmd);
  },

  commit(commitMsg: string) {
    const cmd = `git commit -m "${commitMsg}"`;
    execSync(cmd);
  },
};

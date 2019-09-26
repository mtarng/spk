import { exec } from "./shell";
import { logger } from "../logger";

export const gitGetNameAndEmail = async () => {
  // Get default name/email from git host
  const [gitName, gitEmail] = await Promise.all(
    ["name", "email"].map(async field => {
      try {
        const gitField = await exec("git", ["config", `user.${field}`]);
        return gitField;
      } catch (_) {
        logger.warn(`Unable to parse git.${field} from host.`);
        return `git-${field}`;
      }
    })
  );

  return [gitName, gitEmail];
};

export const gitGetCurrentBranch = async () => {
  try {
    const branch = await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
    return branch;
  } catch (_) {
    logger.warn("Unable to determine current branch.");
    return "";
  }
};

export const gitCheckoutBranch = async (branchName: string) => {
  try {
    await exec("git", ["checkout", `${branchName}`]);
  } catch (_) {
    logger.warn(`unable to checkout git branch ${branchName}.`);
  }
};

export const gitCheckoutNewBranch = async (branchName: string) => {
  try {
    await exec("git", ["checkout", "-b", `${branchName}`]);
  } catch (_) {
    logger.warn(`unable to create and checkout new git branch ${branchName}.`);
  }
};

export const gitDeleteBranch = async (branchName: string) => {
  try {
    await exec("git", ["branch", "-D", `${branchName}`]);
  } catch (_) {
    logger.warn(`unable to delete git branch ${branchName}.`);
  }
};

export const gitCommitDir = async (directory: string, branchName: string) => {
  try {
    await exec("git", ["add", `${directory}`]);
    await exec("git", ["commit", "-m", `Adding new service: ${branchName}`]);
  } catch (_) {
    logger.warn(`unable to push git branch ${branchName}.`);
  }
};

export const gitPushBranch = async (branchName: string) => {
  try {
    await exec("git", ["push", "-u", "origin", `${branchName}`]);
  } catch (_) {
    logger.warn(`unable to push git branch ${branchName}.`);
  }
};

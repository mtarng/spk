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

const getOriginUrl = async () => {
  try {
    const originUrl = await exec("git", [
      "config",
      "--get",
      "remote.origin.url"
    ]);
    logger.debug(`Got git origin url ${originUrl}`);
    return originUrl;
  } catch (_) {
    logger.warn(`unable to git origin URL.`);
  }
  return "";
};

// azdo repo: https://dev.azure.com/{organization}/{project}/_git/{repo-name}/pullrequestcreate?sourceRef={new-branch}&targetRef={base-branch}
// https://dev.azure.com/mitarng/spk-test-project/_git/new-repo/pullrequestcreate?sourceRef=new-branch&targetRef=master

// https://github.com/{user}/{name}/compare/{base-branch}...{new-branch}?expand=1

export const gitGetPullRequestLink = async (
  baseBranch: string,
  newBranch: string
) => {
  const originUrl = await getOriginUrl();
  const isGithubRepo = originUrl.toLowerCase().includes("github.com");
  const isAzDoRepo = originUrl.toLowerCase().includes("github.com");

  if (isGithubRepo) {
    let organization = "my-github-org";
    let repoName = "my-repository";

    if (originUrl.includes("@")) {
      // SSH URL - git@github.com:{organization}/{repoName}.git
      organization = "my ssh org";
      repoName = "my ssh repo name";
    } else if (originUrl.includes("https")) {
      // TODO: Handle HTTPS URL:
      organization = "my https org";
      repoName = "my https repo name";
    }

    logger.debug("github repo found.");
    return `https://github.com/${organization}/${repoName}/compare/${baseBranch}...${newBranch}?expand=1`;
  } else if (isAzDoRepo) {
    logger.debug("Azure DevOps repo found.");

    // git@ssh.dev.azure.com:v3/mitarng/spk-test-project/new-repo
    // https://mitarng@dev.azure.com/mitarng/spk-test-project/_git/new-repo

    return `https://dev.azure.com/${organization}/${project}/_git/${repoName}/pullrequestcreate?sourceRef=${newBranch}&targetRef=${baseBranch}`;
  } else {
    logger.warn(
      "Could not determine origin repository, or it is not a supported type."
    );
    return "Could not determine origin repository. Please check for the newly pushed branch and open a PR manually.";
  }
};

// TODO: change logic to print out, or return a link to where to create a PR.
export const gitRequestPullBranch = async (
  baseBranchName: string,
  newBranchName: string
) => {
  try {
    await exec("git", [
      "push",
      "request-pull",
      `${newBranchName}`,
      `${baseBranchName}`
    ]);
  } catch (_) {
    logger.warn(
      `unable to create new PR for git branch ${newBranchName} onto base ${baseBranchName}.`
    );
  }
};

// TODO: port to simple-git, then do work to create link to manually create PR, only supporting github and azdo repos.

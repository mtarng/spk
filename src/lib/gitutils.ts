import GitUrlParse from "git-url-parse";
import { logger } from "../logger";
import { exec } from "./shell";

/**
 * Gets the current working branch.
 */
export const getCurrentBranch = async (): Promise<string> => {
  try {
    const branch = await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
    return branch;
  } catch (_) {
    throw Error("Unable to determine current branch: " + _);
  }
};

/**
 * Checkout the given branch; optionally create a new branch first.
 *
 * @param branchName
 * @param createNewBranch
 */
export const checkoutBranch = async (
  branchName: string,
  createNewBranch: boolean
): Promise<void> => {
  try {
    if (createNewBranch) {
      await exec("git", ["checkout", "-b", `${branchName}`]);
    } else {
      await exec("git", ["checkout", `${branchName}`]);
    }
  } catch (_) {
    throw Error(`Unable to checkout git branch ${branchName}: ` + _);
  }
};

/**
 * Delete local branch.
 *
 * @param branchName
 */
export const deleteBranch = async (branchName: string): Promise<void> => {
  try {
    await exec("git", ["branch", "-D", `${branchName}`]);
  } catch (_) {
    throw Error(`Unable to delete git branch ${branchName}: ` + _);
  }
};

/**
 * Adds the directory and commits changes for a new service.
 *
 * @param directory
 * @param branchName
 */
export const commitDir = async (
  directory: string,
  branchName: string
): Promise<void> => {
  try {
    await exec("git", ["add", `${directory}`]);
    await exec("git", ["commit", "-m", `Adding new service: ${branchName}`]);
  } catch (_) {
    throw Error(
      `Unable to commit changes in ${directory} to git branch ${branchName}: ` +
        _
    );
  }
};

/**
 * Pushes branch to origin.
 *
 * @param branchName
 */
export const pushBranch = async (branchName: string): Promise<void> => {
  try {
    await exec("git", ["push", "-u", "origin", `${branchName}`]);
  } catch (_) {
    throw Error(`Unable to push git branch ${branchName}: ` + _);
  }
};

/**
 * Gets the origin url.
 */
export const getOriginUrl = async (): Promise<string> => {
  try {
    const originUrl = await exec("git", [
      "config",
      "--get",
      "remote.origin.url"
    ]);
    logger.debug(`Got git origin url ${originUrl}`);
    return originUrl;
  } catch (_) {
    throw Error(`Unable to get git origin URL.: ` + _);
  }
};

/**
 * Will return the name of the repository
 * Currently only AzDo and Github are supported.
 * @param originUrl
 */
export const getRepositoryName = (originUrl: string) => {
  const gitComponents = GitUrlParse(originUrl);
  if (gitComponents.resource.includes("dev.azure.com")) {
    logger.debug("azure devops repo found.");
    return gitComponents.name;
  } else if (gitComponents.resource === "github.com") {
    logger.debug("github repo found.");
    return gitComponents.name;
  } else {
    throw Error(
      "Could not determine origin repository, or it is not a supported type."
    );
  }
};

/**
 * Will return the URL of the repository
 * Currently only AzDo and Github are supported.
 * @param originUrl
 */
export const getRepositoryUrl = (originUrl: string) => {
  const gitComponents = GitUrlParse(originUrl);
  if (gitComponents.resource.includes("dev.azure.com")) {
    logger.debug("azure devops repo found.");
    return `https://dev.azure.com/${gitComponents.organization}/${gitComponents.owner}/_git/${gitComponents.name}`;
  } else if (gitComponents.resource === "github.com") {
    logger.debug("github repo found.");
    return `https://github.com/${gitComponents.organization}/${gitComponents.name}`;
  } else {
    throw Error(
      "Could not determine origin repository, or it is not a supported type."
    );
  }
};

/**
 * Will create a link to create a PR for a given origin, base branch, and new branch.
 * Currently only AzDo and Github are supported.
 *
 * @param baseBranch
 * @param newBranch
 * @param originUrl
 */
export const getPullRequestLink = async (
  baseBranch: string,
  newBranch: string,
  originUrl: string
): Promise<string> => {
  try {
    const gitComponents = GitUrlParse(originUrl);
    if (gitComponents.resource.includes("dev.azure.com")) {
      logger.debug("azure devops repo found.");
      return `https://dev.azure.com/${gitComponents.organization}/${gitComponents.owner}/_git/${gitComponents.name}/pullrequestcreate?sourceRef=${newBranch}&targetRef=${baseBranch}`;
    } else if (gitComponents.resource === "github.com") {
      logger.debug("github repo found.");
      return `https://github.com/${gitComponents.organization}/${gitComponents.name}/compare/${baseBranch}...${newBranch}?expand=1`;
    } else {
      logger.error(
        "Could not determine origin repository, or it is not a supported type."
      );
      return "Could not determine origin repository, or it is not a supported provider. Please check for the newly pushed branch and open a PR manually.";
    }
  } catch (_) {
    throw Error(
      `"Could not determine git provider, or it is not a supported type.": ` + _
    );
  }
};

export const checkoutCommitPushCreatePRLink = async (
  newBranchName: string,
  directory: string
): Promise<void> => {
  try {
    const currentBranch = await getCurrentBranch();
    try {
      await checkoutBranch(newBranchName, true);
      try {
        await commitDir(directory, newBranchName);
        try {
          await pushBranch(newBranchName);

          try {
            const pullRequestLink = await getPullRequestLink(
              currentBranch,
              newBranchName,
              await getOriginUrl()
            );
            logger.info(`Link to create PR: ${pullRequestLink}`);
          } catch (e) {
            logger.error(
              `Could not create link for Pull Request. It will need to be done manually. ${e}`
            );
          }

          // Clean up
          try {
            await checkoutBranch(currentBranch, false);
            try {
              await deleteBranch(newBranchName);
            } catch (e) {
              logger.error(
                `Cannot delete new branch ${newBranchName}. Cleanup will need to be done manually. ${e}`
              );
            }
          } catch (e) {
            logger.error(
              `Cannot checkout original branch ${currentBranch}. Clean up will need to be done manually. ${e}`
            );
          }
        } catch (e) {
          logger.error(
            `Cannot push branch ${newBranchName}. Changes will have to be manually commited. ${e}`
          );
        }
      } catch (e) {
        logger.error(
          `Cannot commit changes in ${directory} to branch ${newBranchName}. Changes will have to be manually commited. ${e}`
        );
      }
    } catch (e) {
      logger.error(
        `Cannot create and checkout new branch ${newBranchName}. Changes will have to be manually commited. ${e}`
      );
    }
  } catch (e) {
    logger.error(
      `Cannot fetch current branch. Changes will have to be manually commited. ${e}`
    );
  }
};

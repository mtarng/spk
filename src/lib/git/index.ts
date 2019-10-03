import * as azdo from "azure-devops-node-api";
import AZGitInterfaces, {
  GitPullRequest
} from "azure-devops-node-api/interfaces/GitInterfaces";
import child_process from "child_process";
import { promisify } from "util";
import { logger } from "../../logger";

interface IGit<PR> {
  pullRequest: (
    title: string,
    description: string,
    sourceRef: string,
    targetRef: string,
    options?: { originPushUrl?: string }
  ) => Promise<PR>;
  [key: string]: any;
}

const Azure = async (
  PAT: string,
  orgUrl: string,
  serverURL?: string
): Promise<IGit<GitPullRequest>> => {
  // Encapsulate reusable objects
  const hiddenPAT = PAT.split("")
    .map((char, i, arr) => (i > arr.length - 5 ? char : "*"))
    .join("");
  logger.info(`Attempting to authenticate with Azure using PAT '${hiddenPAT}'`);
  const authHandler = azdo.getPersonalAccessTokenHandler(PAT);
  const connection = new azdo.WebApi(orgUrl, authHandler);
  const api = await connection.getGitApi(serverURL);
  logger.info(`Successfully authenticated with Azure DevOps!`);

  return {
    pullRequest: async (
      title,
      description,
      sourceRef,
      targetRef,
      options = {}
    ) => {
      const { originPushUrl } = options;
      const pullRequest: AZGitInterfaces.GitPullRequest = {
        description,
        sourceRefName: `refs/heads/${sourceRef}`,
        targetRefName: `refs/heads/${targetRef}`,
        title
      };

      const gitOrigin: string =
        originPushUrl ||
        (await promisify(child_process.exec)(
          "git config --get remote.origin.url"
        ).then(out => out.stdout.trim()));

      if (gitOrigin.length === 0) {
        throw new Error(`No origin found for the current git repository`);
      }

      logger.info(
        `Retrieving repositories associated with Azure PAT '${hiddenPAT}'`
      );
      const repos = await api.getRepositories();
      logger.info(
        `${repos.length} repositories found; parsing for entries matching '${gitOrigin}'`
      );
      const reposMatchingOrigin = repos.filter(repo =>
        [repo.url, repo.sshUrl, repo.webUrl, repo.remoteUrl].includes(gitOrigin)
      );
      logger.info(
        `Found ${reposMatchingOrigin.length} repositor${
          reposMatchingOrigin.length === 1 ? "y" : "ies"
        } with matching URL '${gitOrigin}'`
      );

      const reposWithMatchingBranches = (await Promise.all(
        reposMatchingOrigin.map(async repo => {
          logger.info(`Retrieving branches for repository '${repo.name}'`);
          const branches = await api.getBranches(repo.id!);
          return {
            branches: branches.filter(branch => {
              return [sourceRef, targetRef].includes(branch.name!);
            }),
            repoName: repo.name!
          };
        })
      )).filter(match => match.branches.length === 2);

      // Only allow if one matching repo found
      if (reposMatchingOrigin.length !== 1) {
        if (reposMatchingOrigin.length === 0) {
          throw new Error(
            `No git repositories with remote url '${gitOrigin}' and branches '${sourceRef}' and '${targetRef}' found. Cannot automate pull request.`
          );
        }
        if (reposMatchingOrigin.length > 1) {
          throw new Error(
            `Multiple repositories (${reposWithMatchingBranches.length}) found with branches ${sourceRef} and ${targetRef}; cannot auto-generate PR`
          );
        }
      }

      const repoToPR = reposMatchingOrigin[0];
      logger.info(
        `Creating pull request in repository '${repoToPR.name}' to merge branch '${sourceRef}' into '${targetRef}'`
      );

      return api.createPullRequest(pullRequest, repoToPR.id!);
    }
  };
};

const AZGitAPI = async (orgUrl: string, PAT: string) => {
  const authHandler = azdo.getPersonalAccessTokenHandler(PAT);
  const connection = new azdo.WebApi(orgUrl, authHandler);
  return connection.getGitApi();
};

(async () => {
  const PAT = process.env.PAT;
  const azure = await Azure(PAT!, "https://dev.azure.com/evanlouie");
  const currentBranch = (await promisify(child_process.exec)(
    "git rev-parse --abbrev-ref HEAD"
  )).stdout;

  try {
    const prs = await azure.pullRequest(
      "My Fancy PR",
      "this was made automatically",
      "watch",
      "abrig_coverage",
      {
        originPushUrl:
          "git@ssh.dev.azure.com:v3/evanlouie/spk-testing/spk-testing"
      }
    );
  } catch (err) {
    logger.error(err);
  }
  // const prs = await azure.pullRequest(
  //   "My Fancy PR",
  //   "this was made automatically",
  //   currentBranch,
  //   process.env.INITIAL_RING || "qa"
  // );
})();

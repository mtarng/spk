import fs from "fs";
import yaml from "js-yaml";
import path from "path";
import { promisify } from "util";
import { logger } from "../logger";
import {
  IAzurePipelinesYaml,
  IBedrockFile,
  IHelmConfig,
  IMaintainersFile,
  IUser
} from "../types";

/**
 * Writes out a starter azure-pipelines.yaml
 * One pipeline should exist for each service.
 *
 * @param projectRoot Path to the root of the project (where the bedrock.yaml file exists)
 * @param packagePath Path to the packages directory
 * @param variableGroups Azure DevOps variable group names
 */
export const generateStarterAzurePipelinesYaml = async (
  projectRoot: string,
  packagePath: string,
  opts?: { variableGroups?: string[] }
) => {
  const absProjectRoot = path.resolve(projectRoot);
  const absPackagePath = path.resolve(packagePath);
  const azurePipelineFileName = `azure-pipelines.yaml`;

  logger.info(
    `Generating starter ${azurePipelineFileName} in ${absPackagePath}`
  );

  const { variableGroups = [] } = opts || {};

  logger.debug(`variableGroups length: ${variableGroups.length}`);

  // Check if azure-pipelines.yaml already exists; if it does, skip generation
  const azurePipelinesYamlPath = path.join(
    absPackagePath,
    azurePipelineFileName
  );
  logger.debug(
    `Writing ${azurePipelineFileName} file to ${azurePipelinesYamlPath}`
  );
  if (fs.existsSync(azurePipelinesYamlPath)) {
    logger.warn(
      `Existing ${azurePipelineFileName} found at ${azurePipelinesYamlPath}, skipping generation`
    );
  } else {
    const starterYaml = await starterAzurePipelines({
      relProjectPaths: [path.relative(absProjectRoot, absPackagePath)],
      variableGroups
    });
    // Write
    await promisify(fs.writeFile)(
      azurePipelinesYamlPath,
      yaml.safeDump(starterYaml, { lineWidth: Number.MAX_SAFE_INTEGER }),
      "utf8"
    );
  }
};

// Helper to concat list of script commands to a multi line string
const generateYamlScript = (lines: string[]): string => lines.join("\n");

/**
 * Returns a starter azure-pipelines.yaml string
 * Starter azure-pipelines.yaml based on: https://github.com/andrebriggs/monorepo-example/blob/master/service-A/azure-pipelines.yml
 *
 * @param opts Template options to pass to the the starter yaml
 */
export const starterAzurePipelines = async (opts: {
  relProjectPaths?: string[];
  vmImage?: string;
  branches?: string[];
  variableGroups?: string[];
  variables?: Array<{ name: string; value: string }>;
}): Promise<IAzurePipelinesYaml> => {
  const {
    relProjectPaths = ["."],
    vmImage = "ubuntu-latest",
    branches = ["master"],
    variableGroups = [],
    variables = []
  } = opts;

  // Ensure any blank paths are turned into "./"
  const cleanedPaths = relProjectPaths
    .map(p => (p === "" ? "./" : p))
    .map(p => (p.startsWith("./") === false ? "./" + p : p));

  // based on https://github.com/andrebriggs/monorepo-example/blob/master/service-A/azure-pipelines.yml
  // tslint:disable: object-literal-sort-keys
  const starter: IAzurePipelinesYaml = {
    trigger: {
      branches: { include: branches },
      paths: { include: cleanedPaths }
    },
    variables: [...variableGroups.map(group => ({ group })), ...variables],
    stages: [
      {
        // Build stage
        stage: "build",
        jobs: [
          {
            job: "run_build_push_acr",
            pool: {
              vmImage
            },
            steps: [
              {
                script: generateYamlScript([
                  `echo "az login --service-principal --username $(SP_APP_ID) --password $(SP_PASS) --tenant $(SP_TENANT)"`,
                  `az login --service-principal --username "$(SP_APP_ID)" --password "$(SP_PASS)" --tenant "$(SP_TENANT)"`
                ]),
                displayName: "Azure Login"
              },
              ...cleanedPaths.map(projectPath => {
                const projectPathParts = projectPath
                  .split(path.sep)
                  .filter(p => p !== "");
                // If a the projectPath contains more than 1 segment (a service in a
                // mono-repo), use the last part as the project name as it will the
                // folder containing the Dockerfile. Otherwise, its a standard service
                // and does not need a a project name
                const projectName =
                  projectPathParts.length > 1
                    ? "-" + projectPathParts.slice(-1)[0]
                    : "";
                return {
                  script: generateYamlScript([
                    `cd ${projectPath}`,
                    `echo "az acr build -r $(ACR_NAME) --image $(Build.Repository.Name)${projectName}:$(Build.SourceBranchName)-$(Build.BuildNumber) ."`,
                    `az acr build -r $(ACR_NAME) --image $(Build.Repository.Name)${projectName}:$(Build.SourceBranchName)-$(Build.BuildNumber) .`
                  ]),
                  displayName: "ACR Build and Publish"
                };
              })
            ]
          }
        ]
      },
      {
        // Update HLD Stage
        stage: "hld_update",
        dependsOn: "build",
        condition:
          "and(succeeded('build'), or(startsWith(variables['Build.SourceBranch'], 'refs/heads/DEPLOY/'),eq(variables['Build.SourceBranchName'],'master')))",
        jobs: [
          {
            job: "update_image_tag",
            pool: {
              vmImage
            },
            steps: [
              {
                script: generateYamlScript([
                  `# Download build.sh`,
                  `curl https://raw.githubusercontent.com/Microsoft/bedrock/master/gitops/azure-devops/build.sh > build.sh`,
                  `chmod +x ./build.sh`
                ]),
                displayName: "Download bedrock bash scripts"
              },
              ...cleanedPaths.map(projectPath => {
                logger.info(`projectPath: ${projectPath}`);
                const projectPathParts = projectPath
                  .split(path.sep)
                  .filter(p => p !== "");
                // If a the projectPath contains more than 1 segment (a service in a
                // mono-repo), use the last part as the project name as it will the
                // folder containing the Dockerfile. Otherwise, its a standard service
                // and does not need a a project name

                logger.info(`projectPathParts: ${projectPathParts}`);
                const projectName =
                  projectPathParts.length > 1
                    ? projectPathParts.slice(-1)[0]
                    : "";

                logger.info(`projectName: ${projectName}`);
                logger.info(`projectPath: ${projectPath}`);
                return {
                  script: generateYamlScript([
                    `# --- From https://raw.githubusercontent.com/Microsoft/bedrock/master/gitops/azure-devops/release.sh`,
                    `. build.sh --source-only`,
                    ``,
                    `# Initialization`,
                    `verify_access_token`,
                    `init`,
                    `helm init`,
                    ``,
                    `# Fabrikate`,
                    `get_fab_version`,
                    `download_fab`,
                    ``,
                    `# Clone HLD repo`,
                    `git_connect`,
                    `# --- End Script`,
                    ``,
                    `# Update HLD`,
                    `git checkout -b "DEPLOY/$(Build.Repository.Name)-${projectName}-$(Build.SourceBranchName)-$(Build.BuildNumber)"`,
                    `../fab/fab set --subcomponent ${projectName} image.tag=$(Build.SourceBranchName)-$(Build.BuildNumber)`,
                    `echo "GIT STATUS"`,
                    `git status`,
                    `echo "GIT ADD (git add -A)"`,
                    `git add -A`,
                    ``,
                    `# Set git identity`,
                    `git config user.email "admin@azuredevops.com"`,
                    `git config user.name "Automated Account"`,
                    ``,
                    `# Commit changes`,
                    `echo "GIT COMMIT"`,
                    `git commit -m "Updating ${projectName} image tag to $(Build.SourceBranchName)-$(Build.BuildNumber)."`,
                    ``,
                    `# Git Push`,
                    `git_push`,
                    ``,
                    `# Open PR via az repo cli`,
                    `echo 'az extension add --name azure-devops'`,
                    `az extension add --name azure-devops`,
                    ``,
                    `echo 'az devops login'`,
                    `echo "$(PAT)" | az devops login`,
                    ``,
                    `echo 'az repos pr create --description "Updating ${projectName} to $(Build.SourceBranchName)-$(Build.BuildNumber)."'`,
                    `az repos pr create --description "Updating ${projectName} to $(Build.SourceBranchName)-$(Build.BuildNumber)."`
                  ]),
                  displayName:
                    "Download Fabrikate, Update HLD, Push changes, Open PR",
                  env: {
                    ACCESS_TOKEN_SECRET: "$(PAT)",
                    REPO: "$(HLD_REPO)"
                  }
                };
              })
            ]
          }
        ]
      }
    ]
  };
  // tslint:enable: object-literal-sort-keys

  const requiredPipelineVariables = [
    `'ACR_NAME' (name of your ACR)`,
    `'HLD_REPO' (Repository for your HLD in AzDo. eg. 'dev.azure.com/bhnook/fabrikam/_git/hld')`,
    `'PAT' (AzDo Personal Access Token with permissions to the HLD repository.)`,
    `'SP_APP_ID' (service principal ID with access to your ACR)`,
    `'SP_PASS' (service principal secret)`,
    `'SP_TENANT' (service principal tenant)`
  ].join(", ");

  for (const relPath of cleanedPaths) {
    const relPathParts = relPath.split(path.sep).filter(p => p !== "");
    const packagesDir =
      relPathParts.length > 1 ? relPathParts.slice(-2)[0] : undefined;
    const packagesOption = packagesDir ? `--packages-dir ${packagesDir} ` : "";
    const serviceName =
      relPathParts.length > 1
        ? relPathParts.slice(-2)[1]
        : process
            .cwd()
            .split(path.sep)
            .slice(-1)[0];
    const spkServiceCreatePipelineCmd =
      "spk service create-pipeline " + packagesOption + serviceName;
    logger.info(
      `Generated azure-pipelines.yaml for service in path '${relPath}'. Commit and push this file to master before attempting to deploy via the command '${spkServiceCreatePipelineCmd}'; before running the pipeline ensure the following environment variables are available to your pipeline: ${requiredPipelineVariables}`
    );
  }

  return starter;
};

/**
 * Writes out the hld azure-pipelines.yaml file to `targetPath`
 *
 * @param hldRepoDirectory Path to write the azure-pipelines.yaml file to
 */
export const generateHldAzurePipelinesYaml = (targetDirectory: string) => {
  const absTargetPath = path.resolve(targetDirectory);
  logger.info(`Generating hld azure-pipelines.yaml in ${absTargetPath}`);

  const azurePipelinesYamlPath = path.join(
    absTargetPath,
    "azure-pipelines.yaml"
  );

  if (fs.existsSync(azurePipelinesYamlPath)) {
    logger.warn(
      `Existing azure-pipelines.yaml found at ${azurePipelinesYamlPath}, skipping generation`
    );

    return;
  }
  const hldYaml = manifestGenerationPipelineYaml();
  logger.info(`Writing azure-pipelines.yaml file to ${azurePipelinesYamlPath}`);
  fs.writeFileSync(azurePipelinesYamlPath, hldYaml, "utf8");
};

/**
 * Returns a the Manifest Generation Pipeline as defined here: https://github.com/microsoft/bedrock/blob/master/gitops/azure-devops/ManifestGeneration.md#add-azure-pipelines-build-yaml
 */
const manifestGenerationPipelineYaml = () => {
  // based on https://github.com/microsoft/bedrock/blob/master/gitops/azure-devops/ManifestGeneration.md#add-azure-pipelines-build-yaml
  // tslint:disable: object-literal-sort-keys
  // tslint:disable: no-empty
  const pipelineYaml: IAzurePipelinesYaml = {
    trigger: {
      branches: {
        include: ["master"]
      }
    },
    pool: {
      vmImage: "Ubuntu-16.04"
    },
    steps: [
      {
        checkout: "self",
        persistCredentials: true,
        clean: true
      },
      {
        bash: generateYamlScript([
          // TODO: Double check this script, it's turning it tnto a list with a '-'.
          `curl $BEDROCK_BUILD_SCRIPT > build.sh`,
          `chmod +x ./build.sh`
        ]),
        displayName: "Download Bedrock orchestration script",
        env: {
          BEDROCK_BUILD_SCRIPT:
            "https://raw.githubusercontent.com/Microsoft/bedrock/master/gitops/azure-devops/build.sh"
        }
      },
      {
        task: "ShellScript@2",
        displayName: "Validate fabrikate definitions",
        inputs: {
          scriptPath: "build.sh"
        },
        condition: `eq(variables['Build.Reason'], 'PullRequest')`,
        env: {
          VERIFY_ONLY: 1
        }
      },
      {
        task: "ShellScript@2",
        displayName:
          "Transform fabrikate definitions and publish to YAML manifests to repo",
        inputs: {
          scriptPath: "build.sh"
        },
        condition: `ne(variables['Build.Reason'], 'PullRequest')`,
        env: {
          ACCESS_TOKEN_SECRET: "$(ACCESS_TOKEN)",
          COMMIT_MESSAGE: "$(Build.SourceVersionMessage)",
          REPO: "$(MANIFEST_REPO)",
          BRANCH_NAME: "$(Build.SourceBranchName)"
        }
      }
    ]
  };
  // tslint:enable: object-literal-sort-keys
  // tslint:enable: no-empty

  return yaml.safeDump(pipelineYaml, { lineWidth: Number.MAX_SAFE_INTEGER });
};

/**
 * Writes out the service to hld lifecycle pipeline.
 * This pipeline utilizes spk hld reconcile to add/remove services from the hld repository.
 *
 * @param projectRoot
 */
export const generateHldLifecyclePipelineYaml = async (projectRoot: string) => {
  logger.info(
    `Generating hld lifecycle pipeline hld-lifecycle.yaml in ${projectRoot}`
  );

  const azurePipelinesYamlPath = path.join(projectRoot, "hld-lifecycle.yaml");

  if (fs.existsSync(azurePipelinesYamlPath)) {
    logger.warn(
      `Existing hld-lifecycle.yaml found at ${azurePipelinesYamlPath}, skipping generation`
    );

    return;
  }

  const lifecycleYaml = hldLifecyclePipelineYaml();
  logger.info(`Writing hld-lifecycle.yaml file to ${azurePipelinesYamlPath}`);
  fs.writeFileSync(azurePipelinesYamlPath, lifecycleYaml, "utf8");

  const requiredPipelineVariables = [
    `'HLD_REPO' (Repository for your HLD in AzDo. eg. 'dev.azure.com/bhnook/fabrikam/_git/hld')`,
    `'PAT' (AzDo Personal Access Token with permissions to the HLD repository.)`
  ].join(", ");

  logger.info(
    `Generated hld-lifecycle.yaml. Commit and push this file to master before attempting to deploy via the command 'spk project create-lifecycle-pipeline'; before running the pipeline ensure the following environment variables are available to your pipeline: ${requiredPipelineVariables}`
  );
};

const hldLifecyclePipelineYaml = () => {
  // tslint:disable: object-literal-sort-keys
  // tslint:disable: no-empty
  const pipelineyaml: IAzurePipelinesYaml = {
    trigger: {
      branches: {
        include: ["master"]
      }
    },
    variables: [],
    pool: {
      vmImage: "ubuntu-latest"
    },
    steps: [
      {
        script: generateYamlScript([
          `# Download build.sh`,
          `curl https://raw.githubusercontent.com/Microsoft/bedrock/master/gitops/azure-devops/build.sh > build.sh`,
          `chmod +x ./build.sh`
        ]),
        displayName: "Download bedrock bash scripts"
      },
      {
        script: generateYamlScript([
          `# From https://raw.githubusercontent.com/Microsoft/bedrock/master/gitops/azure-devops/release.sh`,
          `. build.sh --source-only`,
          ``,
          `# Initialization`,
          `verify_access_token`,
          `init`,
          `helm init`,
          ``,
          `# Fabrikate`,
          `get_fab_version`,
          `download_fab`,
          ``,
          `# SPK`,
          `get_spk_version`,
          `download_spk`,
          ``,
          `# Clone HLD repo`,
          `git_connect`,
          ``,
          `# Update HLD via spk`,
          `git checkout -b "RECONCILE/$(Build.Repository.Name)-$(Build.BuildNumber)"`,
          `echo "spk hld reconcile $(Build.Repository.Name) $PWD"`,
          `spk hld reconcile $(Build.Repository.Name) $PWD`,
          `echo "GIT STATUS"`,
          `git status`,
          `echo "GIT ADD (git add -A)"`,
          `git add -A`,
          ``,
          `# Set git identity`,
          `git config user.email "admin@azuredevops.com"`,
          `git config user.name "Automated Account"`,
          ``,
          `# Commit changes`,
          `echo "GIT COMMIT"`,
          `git commit -m "Reconciling HLD with $(Build.Repository.Name)-$(Build.BuildNumber)."`,
          ``,
          `# Git Push`,
          `git_push`,
          ``,
          `# Open PR via az repo cli`,
          `echo 'az extension add --name azure-devops'`,
          `az extension add --name azure-devops`,
          ``,
          `echo 'az devops login'`,
          `echo "$(PAT)" | az devops login`,
          ``,
          `echo 'az repos pr create --description "Reconciling HLD with $(Build.Repository.Name)-$(Build.BuildNumber)."'`,
          `az repos pr create --description "Reconciling HLD with $(Build.Repository.Name)-$(Build.BuildNumber)."`
        ]),
        displayName:
          "Download Fabrikate and SPK, Update HLD, Push changes, Open PR",
        env: {
          ACCESS_TOKEN_SECRET: "$(PAT)",
          REPO: "$(HLD_REPO)"
        }
      }
    ]
  };
  // tslint:enable: object-literal-sort-keys
  // tslint:enable: no-empty

  return yaml.safeDump(pipelineyaml, { lineWidth: Number.MAX_SAFE_INTEGER });
};

/**
 * Update maintainers.yml with new service
 *
 * TODO: support for contributors(?)
 *
 * @param maintainersFilePath
 * @param newServicePath
 * @param serviceMaintainers
 */
export const addNewServiceToMaintainersFile = (
  maintainersFilePath: string,
  newServicePath: string,
  serviceMaintainers: IUser[]
) => {
  const maintainersFile = yaml.safeLoad(
    fs.readFileSync(maintainersFilePath, "utf8")
  ) as IMaintainersFile;

  maintainersFile.services["./" + newServicePath] = {
    maintainers: serviceMaintainers
  };

  logger.info("Updating maintainers.yaml");
  fs.writeFileSync(maintainersFilePath, yaml.safeDump(maintainersFile), "utf8");
};

/**
 * Writes out a default .gitignore file if one doesn't exist
 *
 * @param targetDirectory directory to generate the .gitignore file
 * @param content content of file
 */
export const generateGitIgnoreFile = (
  targetDirectory: string,
  content: string
) => {
  const absTargetPath = path.resolve(targetDirectory);
  logger.info(`Generating starter .gitignore in ${absTargetPath}`);

  const gitIgnoreFilePath = path.join(absTargetPath, ".gitignore");

  if (fs.existsSync(gitIgnoreFilePath)) {
    logger.warn(
      `Existing .gitignore found at ${gitIgnoreFilePath}, skipping generation`
    );

    return;
  }

  logger.info(`Writing .gitignore file to ${gitIgnoreFilePath}`);
  fs.writeFileSync(gitIgnoreFilePath, content, "utf8");
};

/**
 * Update bedrock.yml with new service
 *
 * @param bedrockFilePath
 * @param newServicePath
 */
export const addNewServiceToBedrockFile = (
  bedrockFilePath: string,
  newServicePath: string,
  helmConfig: IHelmConfig
) => {
  const bedrockFile = yaml.safeLoad(
    fs.readFileSync(bedrockFilePath, "utf8")
  ) as IBedrockFile;

  bedrockFile.services["./" + newServicePath] = {
    helm: helmConfig
  };

  logger.info("Updating bedrock.yaml");
  fs.writeFileSync(bedrockFilePath, yaml.safeDump(bedrockFile), "utf8");
};

/**
 * Writes out a default Dockerfile if one doesn't exist
 *
 * @param targetDirectory directory to generate the Dockerfile
 * @param content content of file
 */
export const generateDockerfile = (targetDirectory: string) => {
  const absTargetPath = path.resolve(targetDirectory);
  logger.info(`Generating starter Dockerfile in ${absTargetPath}`);

  const dockerfilePath = path.join(absTargetPath, "Dockerfile");

  if (fs.existsSync(dockerfilePath)) {
    logger.warn(
      `Existing Dockerfile found at ${dockerfilePath}, skipping generation.`
    );

    return;
  }

  logger.info(`Writing Dockerfile to ${dockerfilePath}`);
  fs.writeFileSync(
    dockerfilePath,
    "FROM alpine\nRUN echo 'hello world'",
    "utf8"
  );
};

import commander from "commander";
import path from "path";
import shelljs from "shelljs";
import { logger } from "../../logger";
import {
  generateAzurePipelinesYaml,
  createGitignoreFile
} from "../../lib/fileutils";

/**
 * Adds the create command to the service command object
 *
 * @param command Commander command object to decorate
 */
export const createCommandDecorator = (command: commander.Command): void => {
  command
    .command("create <service-name>")
    .alias("c")
    .description(
      "Add a new service into this initialized spk project repository"
    )
    .option(
      "-d, --packages-dir <dir>",
      "The directory containing the mono-repo packages.",
      ""
    )
    .option(
      "-m, --maintainer-name <maintainer-name>",
      "The name of the primary maintainer for this service",
      "my-maintainer-name"
    )
    .option(
      "-e, --maintainer-email <maintainer-email>",
      "The email of the primary maintainer for this service",
      "my-maintainer-email"
    )
    .action(async (serviceName, opts) => {
      const { packagesDir, maintainerName, maintainerEmail } = opts;
      const projectPath = process.cwd();
      try {
        // Type check all parsed command line args here.
        if (typeof serviceName !== "string") {
          throw new Error(
            `serviceName must be of type 'string', ${typeof serviceName} given.`
          );
        }
        if (typeof packagesDir !== "string") {
          throw new Error(
            `packagesDir must be of type 'string', ${typeof packagesDir} given.`
          );
        }
        if (typeof maintainerName !== "string") {
          throw new Error(
            `maintainerName must be of type 'string', ${typeof maintainerName} given.`
          );
        }
        if (typeof maintainerEmail !== "string") {
          throw new Error(
            `maintainerEmail must be of type 'string', ${typeof maintainerEmail} given.`
          );
        }

        // TODO: Check that this is a spk/bedrock repository and that the parent directory is initialized.
        // This check should be in a shared library

        await createService(projectPath, serviceName, packagesDir, {
          maintainerName,
          maintainerEmail
        });
      } catch (err) {
        logger.error(
          `Error occurred adding service ${serviceName} to project ${projectPath}`
        );
        logger.error(err);
      }
    });
};

/**
 * Create a service in a bedrock project directory.
 *
 * @param rootProjectPath
 * @param serviceName
 * @param opts
 */
export const createService = async (
  rootProjectPath: string,
  serviceName: string,
  packagesDir: string,
  opts?: { maintainerName: string; maintainerEmail: string }
) => {
  const { maintainerName, maintainerEmail } = opts || {};

  logger.info(
    `Adding Service: ${serviceName}, to Project: ${rootProjectPath} under directory: ${packagesDir}`
  );
  logger.info(
    `MaintainerName: ${maintainerName}, MaintainerEmail: ${maintainerEmail}`
  );

  // TODO: consider if there is a '/packages' directory to place all services under.
  const newServiceDir = path.join(rootProjectPath, packagesDir, serviceName);

  // Mkdir
  shelljs.mkdir("-p", newServiceDir);

  // Create azure pipelines yaml in directory
  await generateAzurePipelinesYaml(rootProjectPath, newServiceDir);

  // Create .gitignore file in directory
  await createGitignoreFile(rootProjectPath, newServiceDir);

  // add maintainers to file in parent repo file

  // Add relevant bedrock info to parent bedrock.yaml
};

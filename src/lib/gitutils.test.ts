import { disableVerboseLogging, enableVerboseLogging, logger } from "../logger";
import { getGitNameAndEmail } from "./gitutils";

beforeAll(() => {
  enableVerboseLogging();
});

afterAll(() => {
  disableVerboseLogging();
});

describe("Getting local host's git config user name and email.", () => {
  test("gets name and email", async () => {
    let gitNameAndEmail = await getGitNameAndEmail();

    expect(Array.isArray(gitNameAndEmail)).toBe(true);

    expect(typeof gitNameAndEmail[0]).toBe("string");
    expect(typeof gitNameAndEmail[1]).toBe("string");

    logger.info(gitNameAndEmail[0]);
    logger.info(gitNameAndEmail[1]);
  });
});

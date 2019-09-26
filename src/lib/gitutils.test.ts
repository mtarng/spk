import uuid from "uuid/v4";
import { disableVerboseLogging, enableVerboseLogging, logger } from "../logger";
import {
  gitGetNameAndEmail,
  gitGetCurrentBranch,
  gitCheckoutBranch,
  gitCheckoutNewBranch,
  gitDeleteBranch,
  gitPushBranch
} from "./gitutils";

beforeAll(() => {
  enableVerboseLogging();
});

afterAll(() => {
  disableVerboseLogging();
});

describe("Getting local host's git config user name and email.", () => {
  test("gets name and email", async () => {
    let gitNameAndEmail = await gitGetNameAndEmail();

    expect(Array.isArray(gitNameAndEmail)).toBe(true);

    expect(typeof gitNameAndEmail[0]).toBe("string");
    expect(typeof gitNameAndEmail[1]).toBe("string");
  });
});

describe("Get current git branch", () => {
  test("git branch", async () => {
    let currentBranch = await gitGetCurrentBranch();

    expect(typeof currentBranch).toBe("string");

    logger.info(`current branch ${currentBranch}`);
  });
});

// describe("Get create git branch", () => {
//   test("create new branch and commit.", async () => {
//     let initialBranch = await gitGetCurrentBranch();
//     expect(typeof initialBranch).toBe("string");
//     logger.info(`current branch ${initialBranch}`);

//     let newBranch = uuid();

//     // Create and checkout new branch
//     logger.info("Creating and checking out new branch.");
//     await gitCheckoutNewBranch(newBranch);
//     let currentBranch = await gitGetCurrentBranch();
//     expect(typeof currentBranch).toBe("string");
//     expect(currentBranch).toEqual(newBranch);
//     logger.info(`current branch ${currentBranch}`);

//     // Push branch
//     await gitPushBranch(currentBranch);

//     // Checkout original branch
//     logger.info("Checking out initial branch.");
//     await gitCheckoutBranch(initialBranch);
//     currentBranch = await gitGetCurrentBranch();
//     expect(typeof currentBranch).toBe("string");
//     expect(currentBranch).toEqual(initialBranch);
//     logger.info(`current branch ${currentBranch}`);

//     // Delete new temp branch
//     gitDeleteBranch(newBranch);
//   });
// });

const parseArgsAndExecute = require("../lib");
const { CONFIG_FILENAME } = require("../lib/constants");
const { addCommmitMsgPrefix, removeCommitMsgPrefix, getLastGitSliceCommitMsg } = require("../lib/utils");
const Git = require("nodegit");
const path = require("path");
const fs = require("fs-extra");

const mainRepoRelativePath = "./repos/push/main";
const folderRepoRelativePath = "./repos/push/folder";
const mainRepoPath = path.resolve(__dirname, mainRepoRelativePath);
const folderRepoPath = path.resolve(__dirname, folderRepoRelativePath);

const repoToClone = "https://github.com/arslanarshad31/trello-react.git";
const folderPaths = ["public", "src/reducers"]; // to be modified with the repo
const folderPathRegExp = new RegExp(folderPaths.join("|^"));
let mainRepo;
let folderRepo;
const branchName = "master";

beforeAll(async done => {
  jest.setTimeout(10000);
  await Git.Clone.clone(repoToClone, mainRepoPath);
  done();
});

beforeEach(async done => {
  const initCmd = `init ${folderRepoRelativePath} --repo ${mainRepoRelativePath} --folder ${
    folderPaths[0]
  } --folder ${folderPaths[1]} --branch ${branchName}`;
  await parseArgsAndExecute(__dirname, initCmd.split(" "));
  mainRepo = await Git.Repository.open(mainRepoPath);
  folderRepo = await Git.Repository.open(folderRepoPath);
  done();
});

afterEach(async done => {
  await fs.remove(folderRepoPath);
  done();
});

afterAll(async done => {
  await fs.remove(mainRepoPath);
  done();
});

describe("Main repo is synced properly with folder repo", () => {
  test("added files in folder repo are properly synced to the main folder", async () => {
    const branchName = "test-branch-1";
    const commitMsg = "added some files";

    const newBranch = await folderRepo.createBranch(
      branchName,
      (await folderRepo.getMasterCommit()).sha(),
      0 // gives error if the branch already exists
    );
    await folderRepo.checkoutBranch(branchName);

    const testFile1Path = path.resolve(
      folderRepoPath,
      folderPaths[0],
      "testFile1.txt"
    );
    const testFile2Path = path.resolve(
      folderRepoPath,
      folderPaths[1],
      "testFile2.txt"
    );
    const testFile3Path = path.resolve(
      folderRepoPath,
      folderPaths[1],
      "testFile3.txt"
    );
    const testFile1Text = "Hello World!";
    const testFile2Text = "How are you?";
    const testFile3Text = "I am good";
    await fs.outputFile(testFile1Path, testFile1Text);
    await fs.outputFile(testFile2Path, testFile2Text);
    await fs.outputFile(testFile3Path, testFile3Text);
    const signature = mainRepo.defaultSignature();

    let index = await folderRepo.refreshIndex();
    await index.addByPath(path.relative(folderRepoPath, testFile1Path));
    await index.addByPath(path.relative(folderRepoPath, testFile2Path));
    await index.addByPath(path.relative(folderRepoPath, testFile3Path));
    await index.write();
    const oid = await index.writeTree();
    const parent = await folderRepo.getCommit(
      await Git.Reference.nameToId(folderRepo, "HEAD")
    );
    const addedFiles = await folderRepo.createCommit(
      "HEAD",
      signature,
      signature,
      commitMsg,
      oid,
      [parent]
    );
    const pushCmd = `push --branch ${branchName} --message ${commitMsg}`;
    await parseArgsAndExecute(folderRepoPath, pushCmd.split(" "));

    expect(
      await fs.readFile(
        testFile1Path.replace(folderRepoPath, mainRepoPath),
        "utf8"
      )
    ).toBe(testFile1Text);
    expect(
      await fs.readFile(
        testFile2Path.replace(folderRepoPath, mainRepoPath),
        "utf8"
      )
    ).toBe(testFile2Text);
    expect(
      await fs.readFile(
        testFile3Path.replace(folderRepoPath, mainRepoPath),
        "utf8"
      )
    ).toBe(testFile3Text);

    const expectedCommitMessage = addCommmitMsgPrefix(
      (await mainRepo.getMasterCommit()).sha()
    );
    const outputCommitMessage = (await folderRepo.getMasterCommit()).message();
    expect(outputCommitMessage).toBe(expectedCommitMessage);
  });

  test("deleted files in the folder repo are properly synced to the main repo", async () => {
    const branchName = "test-branch-2";
    const commitMsg = "deleted some files";

    const newBranch = await folderRepo.createBranch(
      branchName,
      (await folderRepo.getMasterCommit()).sha(),
      0 // gives error if the branch already exists
    );
    await folderRepo.checkoutBranch(branchName);

    const testFile1 = (await fs.readdir(
      path.resolve(folderRepoPath, folderPaths[0])
    ))[0];
    const testFile1Path = path.resolve(
      folderRepoPath,
      folderPaths[0],
      testFile1
    );
    const testFile2 = (await fs.readdir(
      path.resolve(folderRepoPath, folderPaths[1])
    ))[0];
    const testFile2Path = path.resolve(
      folderRepoPath,
      folderPaths[1],
      testFile2
    );
    await fs.remove(testFile1Path);
    await fs.remove(testFile2Path);

    const signature = mainRepo.defaultSignature();
    let index = await folderRepo.refreshIndex();
    await index.remove(path.relative(folderRepoPath, testFile1Path), 0);
    await index.remove(path.relative(folderRepoPath, testFile2Path), 0);
    await index.write();
    const oid = await index.writeTree();
    const parent = await folderRepo.getCommit(
      await Git.Reference.nameToId(folderRepo, "HEAD")
    );
    const addedFiles = await folderRepo.createCommit(
      "HEAD",
      signature,
      signature,
      commitMsg,
      oid,
      [parent]
    );
    const pushCmd = `push --branch ${branchName} --message ${commitMsg}`;
    await parseArgsAndExecute(folderRepoPath, pushCmd.split(" "));

    expect(
      await fs.exists(testFile1Path.replace(folderRepoPath, mainRepoPath))
    ).toBe(false);
    expect(
      await fs.exists(testFile2Path.replace(folderRepoPath, mainRepoPath))
    ).toBe(false);

    const expectedCommitMessage = addCommmitMsgPrefix(
      (await mainRepo.getMasterCommit()).sha()
    );
    const outputCommitMessage = (await folderRepo.getMasterCommit()).message();
    expect(outputCommitMessage).toBe(expectedCommitMessage);
  });

  test("properly updates if the branch already exists in the main repo", async () => {
    const branchName = "test-branch-3";
    const commitMsg = "added some files";

    const newBranch = await folderRepo.createBranch(
      branchName,
      (await folderRepo.getMasterCommit()).sha(),
      0 // gives error if the branch already exists
    );
    await folderRepo.checkoutBranch(branchName);

    await mainRepo.createBranch(
      branchName,
      removeCommitMsgPrefix((await folderRepo.getMasterCommit()).message()),
      0 // gives error if the branch already exists
    );
    await mainRepo.checkoutBranch(branchName);

    const testFile1Path = path.resolve(
      folderRepoPath,
      folderPaths[0],
      "testFile1.txt"
    );
    const testFile2Path = path.resolve(
      folderRepoPath,
      folderPaths[1],
      "testFile2.txt"
    );
    const testFile3Path = path.resolve(
      folderRepoPath,
      folderPaths[1],
      "testFile3.txt"
    );

    // to placed in main repo
    const testFile4Path = path.resolve(
      mainRepoPath,
      folderPaths[0],
      "testFile4.txt"
    );

    const testFile1Text = "Hello World!";
    const testFile2Text = "How are you?";
    const testFile3Text = "I am good";
    const testFile4Text = "This file in main repo should be deleted";

    await fs.outputFile(testFile1Path, testFile1Text);
    await fs.outputFile(testFile2Path, testFile2Text);
    await fs.outputFile(testFile3Path, testFile3Text);
    await fs.outputFile(testFile4Path, testFile4Text);
    const signature = mainRepo.defaultSignature();

    //commmit textFile4 in main repo
    const mainRepoIndex = await mainRepo.refreshIndex();
    await mainRepoIndex.addByPath(path.relative(mainRepoPath, testFile4Path));
    await mainRepoIndex.write();
    const mainRepoOid = await mainRepoIndex.writeTree();
    const mainRepoParent = await mainRepo.getCommit(
      await Git.Reference.nameToId(mainRepo, "HEAD")
    );
    await mainRepo.createCommit(
      "HEAD",
      signature,
      signature,
      "adding a test file",
      mainRepoOid,
      [mainRepoParent]
    );

    const folderRepoIndex = await folderRepo.refreshIndex();
    await folderRepoIndex.addByPath(
      path.relative(folderRepoPath, testFile1Path)
    );
    await folderRepoIndex.addByPath(
      path.relative(folderRepoPath, testFile2Path)
    );
    await folderRepoIndex.addByPath(
      path.relative(folderRepoPath, testFile3Path)
    );
    await folderRepoIndex.write();
    const oid = await folderRepoIndex.writeTree();
    const parent = await folderRepo.getCommit(
      await Git.Reference.nameToId(folderRepo, "HEAD")
    );
    const addedFiles = await folderRepo.createCommit(
      "HEAD",
      signature,
      signature,
      commitMsg,
      oid,
      [parent]
    );
    const pushCmd = `push --branch ${branchName} --message ${commitMsg}`;
    await parseArgsAndExecute(folderRepoPath, pushCmd.split(" "));

    expect(
      await fs.readFile(
        testFile1Path.replace(folderRepoPath, mainRepoPath),
        "utf8"
      )
    ).toBe(testFile1Text);
    expect(
      await fs.readFile(
        testFile2Path.replace(folderRepoPath, mainRepoPath),
        "utf8"
      )
    ).toBe(testFile2Text);
    expect(
      await fs.readFile(
        testFile3Path.replace(folderRepoPath, mainRepoPath),
        "utf8"
      )
    ).toBe(testFile3Text);

    const expectedCommitMessage = addCommmitMsgPrefix(
      (await mainRepo.getMasterCommit()).sha()
    );
    const outputCommitMessage = (await folderRepo.getMasterCommit()).message();
    expect(outputCommitMessage).toBe(expectedCommitMessage);
  });

  test("properly store the mapping of pushed branches", async () => {
    const branchName = "test-branch-4";
    const folderBranchName = "helloBranch";
    const commitMsg = "deleted some files";

    const newBranch = await folderRepo.createBranch(
      folderBranchName,
      (await folderRepo.getMasterCommit()).sha(),
      0 // gives error if the branch already exists
    );
    await folderRepo.checkoutBranch(folderBranchName);

    const testFile1 = (await fs.readdir(
      path.resolve(folderRepoPath, folderPaths[0])
    ))[0];
    const testFile1Path = path.resolve(
      folderRepoPath,
      folderPaths[0],
      testFile1
    );
    const testFile2 = (await fs.readdir(
      path.resolve(folderRepoPath, folderPaths[1])
    ))[0];
    const testFile2Path = path.resolve(
      folderRepoPath,
      folderPaths[1],
      testFile2
    );
    await fs.remove(testFile1Path);
    await fs.remove(testFile2Path);

    const signature = mainRepo.defaultSignature();
    let index = await folderRepo.refreshIndex();
    await index.remove(path.relative(folderRepoPath, testFile1Path), 0);
    await index.remove(path.relative(folderRepoPath, testFile2Path), 0);
    await index.write();
    const oid = await index.writeTree();
    const parent = await folderRepo.getCommit(
      await Git.Reference.nameToId(folderRepo, "HEAD")
    );
    const addedFiles = await folderRepo.createCommit(
      "HEAD",
      signature,
      signature,
      commitMsg,
      oid,
      [parent]
    );
    const pushCmd = `push --branch ${branchName} --message ${commitMsg}`;
    await parseArgsAndExecute(folderRepoPath, pushCmd.split(" "));

    const config = await fs.readJson(
      path.resolve(folderRepoPath, CONFIG_FILENAME)
    );
    const expected = Object.assign(config, {
      branchInMain: { [folderBranchName]: branchName }
    });
    expect(
      await fs.readJson(path.resolve(folderRepoPath, CONFIG_FILENAME))
    ).toEqual(expected);
  });

  test("does not push if master branch is checked out", async () => {
    expect.assertions(1);
    await folderRepo.checkoutBranch("master");
    await folderRepo.setHead(`refs/heads/master`);

    const branchName = "test-branch-5";
    const commitMsg = "random commit for testing";
    const pushCmd = `push --branch ${branchName} --message ${commitMsg}`;
    try {
      await parseArgsAndExecute(folderRepoPath, pushCmd.split(" "));
    } catch (e) {
      expect(e).toBe("Error: cannot push from master branch");
    }
  });
  test("does not push if there are uncommitted changes", async () => {
    expect.assertions(1);
    const branchName = "test-branch-4";
    const folderBranchName = "noPush";
    const commitMsg = "made some unimportant changes";

    const newBranch = await folderRepo.createBranch(
      folderBranchName,
      (await folderRepo.getMasterCommit()).sha(),
      0 // gives error if the branch already exists
    );
    await folderRepo.checkoutBranch(folderBranchName);
    const testFile1Path = path.resolve(
      folderRepoPath,
      folderPaths[0],
      "testFile1.txt"
    );
    const testFile2Path = path.resolve(
      folderRepoPath,
      folderPaths[1],
      "testFile2.txt"
    );
    const testFile3Path = path.resolve(
      folderRepoPath,
      folderPaths[1],
      "testFile3.txt"
    );
    const testFile1Text = "Some unimportant text";
    const testFile2Text = "Testing Testing Testing";
    const testFile3Text = "I want to travel";
    await fs.outputFile(testFile1Path, testFile1Text);
    await fs.outputFile(testFile2Path, testFile2Text);
    await fs.outputFile(testFile3Path, testFile3Text);

    try {
      const pushCmd = `push --branch ${branchName} --message ${commitMsg}`;
      await parseArgsAndExecute(folderRepoPath, pushCmd.split(" "));
    } catch (e) {
      expect(e).toBe("Error: cannot push with uncommitted changes");
    }
  });

  test("properly pushes even if there are custom commits in the master", async () => {
    const branchName = "test-branch-5";
    const commitMsg = "added some files";

    const newBranch = await folderRepo.createBranch(
      branchName,
      (await folderRepo.getMasterCommit()).sha(),
      0 // gives error if the branch already exists
    );
    await folderRepo.checkoutBranch(branchName);

    const testFile1Path = path.resolve(
      folderRepoPath,
      folderPaths[0],
      "testFile1.txt"
    );
    const testFile2Path = path.resolve(
      folderRepoPath,
      folderPaths[1],
      "testFile2.txt"
    );
    const testFile3Path = path.resolve(
      folderRepoPath,
      folderPaths[1],
      "testFile3.txt"
    );
    const testFile1Text = "Hello Murcul!";
    const testFile2Text = "How are you doing?";
    const testFile3Text = "I am not good, feeling bored. Lets code?";
    await fs.outputFile(testFile1Path, testFile1Text);
    await fs.outputFile(testFile2Path, testFile2Text);
    await fs.outputFile(testFile3Path, testFile3Text);
    const signature = mainRepo.defaultSignature();

    let index = await folderRepo.refreshIndex();
    await index.addByPath(path.relative(folderRepoPath, testFile1Path));
    await index.addByPath(path.relative(folderRepoPath, testFile2Path));
    await index.addByPath(path.relative(folderRepoPath, testFile3Path));
    await index.write();
    const oid = await index.writeTree();
    const parent = await folderRepo.getCommit(
      await Git.Reference.nameToId(folderRepo, "HEAD")
    );
    await folderRepo.createCommit(
      "HEAD",
      signature,
      signature,
      commitMsg,
      oid,
      [parent]
    );

    await folderRepo.checkoutBranch("master");
    const testFile4Path = path.resolve(
      folderRepoPath,
      folderPaths[1],
      "testFile4.txt"
    );
    const testFile4Text = "Something totally random";
    await fs.outputFile(testFile4Path, testFile4Text);
    let indexMaster = await folderRepo.refreshIndex();
    await indexMaster.addByPath(path.relative(folderRepoPath, testFile4Path));
    await indexMaster.write();
    const oidMaster = await indexMaster.writeTree();
    const parentMaster = await folderRepo.getCommit(
      await Git.Reference.nameToId(folderRepo, "HEAD")
    );
    await folderRepo.createCommit(
      "HEAD",
      signature,
      signature,
      "custom commit",
      oidMaster,
      [parentMaster]
    );
    await folderRepo.checkoutBranch(branchName);
    const pushCmd = `push --branch ${branchName} --message ${commitMsg}`;
    await parseArgsAndExecute(folderRepoPath, pushCmd.split(" "));

    expect(
      await fs.readFile(
        testFile1Path.replace(folderRepoPath, mainRepoPath),
        "utf8"
      )
    ).toBe(testFile1Text);
    expect(
      await fs.readFile(
        testFile2Path.replace(folderRepoPath, mainRepoPath),
        "utf8"
      )
    ).toBe(testFile2Text);
    expect(
      await fs.readFile(
        testFile3Path.replace(folderRepoPath, mainRepoPath),
        "utf8"
      )
    ).toBe(testFile3Text);

    const expectedCommitMessage = addCommmitMsgPrefix(
      (await mainRepo.getMasterCommit()).sha()
    );
    const outputCommitMessage = await getLastGitSliceCommitMsg(folderRepo);
    expect(outputCommitMessage).toBe(expectedCommitMessage);
  });
});

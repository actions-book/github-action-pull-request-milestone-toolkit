const { Toolkit } = require("actions-toolkit");
const nock = require("nock");
nock.disableNetConnect();

process.env.GITHUB_WORKFLOW = "demo-workflow";
process.env.GITHUB_ACTION = "pull-request-milestone";
process.env.GITHUB_ACTOR = "YOUR_USERNAME";
process.env.GITHUB_REPOSITORY = "YOUR_USERNAME/action-test";
process.env.GITHUB_WORKSPACE = "/tmp/github/workspace";
process.env.GITHUB_SHA = "fake-sha-a1c85481edd2ea7d19052874ea3743caa8f1bdf6";
process.env.INPUT_MERGED_3 = "This message is added after 3 PRs are merged";

describe("Pull Request Milestone", () => {
  let action, tools;

  // Mock Toolkit.run to define `action` so we can call it
  Toolkit.run = jest.fn((actionFn) => {
    action = actionFn;
  });
  // Load up our entrypoint file
  require(".");

  beforeEach(() => {
    jest.resetModules();
  });

  it("fails when triggered by the wrong event", () => {
    tools = mockEvent("issues", {});
    expect(action(tools)).rejects.toThrow(
      new Error("Invalid event. Expected 'pull_request', got 'issues'")
    );
  });

  it("fails when triggered by the correct event but the wrong action", () => {
    tools = mockEvent("pull_request", { action: "opened" });
    return expect(action(tools)).rejects.toThrow(
      new Error(
        "Invalid event. Expected 'pull_request.closed', got 'pull_request.opened'"
      )
    );
  });

  it("exits when a pull request is not merged", async () => {
    tools = mockEvent("pull_request", {
      action: "closed",
      pull_request: { merged: false },
    });

    tools.log.warn = jest.fn();
    await action(tools);
    expect(tools.log.warn).toBeCalledWith("Pull request closed without merge");
  });

  it("exits when no action is required", async () => {
    tools = mockEvent("pull_request", {
      action: "closed",
      pull_request: {
        merged: true,
        user: { login: "example-user" },
      },
    });

    const getPrMock = nock("https://api.github.com")
      .get("/repos/YOUR_USERNAME/action-test/pulls?state=closed&per_page=100")
      .reply(200, []);

    tools.log.debug = jest.fn();
    tools.log.info = jest.fn();

    await action(tools);
    expect(tools.log.debug).toBeCalledWith("There are 0 Pull Requests");
    expect(tools.log.info).toBeCalledWith("No action required");
  });

  it("filters down to the current actor", async () => {
    tools = mockEvent("pull_request", {
      action: "closed",
      pull_request: {
        merged: true,
        user: { login: "example-user" },
      },
    });

    const getPrMock = nock("https://api.github.com")
      .get("/repos/YOUR_USERNAME/action-test/pulls?state=closed&per_page=100")
      .reply(200, [
        { merged_at: "2020-04-27T21:21:49Z", user: { login: "example-user" } },
        { merged_at: "2020-04-28T22:53:53Z", user: { login: "non-matching" } },
        { merged_at: "2020-04-29T23:48:22Z", user: { login: "example-user" } },
        { merged_at: null, user: { login: "example-user" } },
        { merged_at: "2020-04-30T00:11:24Z", user: { login: "non-matching" } },
      ]);

    tools.log.debug = jest.fn();
    tools.log.info = jest.fn();

    await action(tools);
    expect(tools.log.debug).toBeCalledWith("There are 2 Pull Requests");
    expect(tools.log.info).toBeCalledWith("No action required");
  });

  it("completes successfully", async () => {
    tools = mockEvent("pull_request", {
      action: "closed",
      pull_request: {
        number: 18,
        merged: true,
        user: { login: "example-user" },
      },
    });

    const getPrMock = nock("https://api.github.com")
      .get("/repos/YOUR_USERNAME/action-test/pulls?state=closed&per_page=100")
      .reply(200, [
        { merged_at: "2020-04-27T21:21:49Z", user: { login: "example-user" } },
        { merged_at: "2020-04-28T22:53:53Z", user: { login: "example-user" } },
        { merged_at: "2020-04-29T23:48:22Z", user: { login: "example-user" } },
      ]);

    const addCommentMock = nock("https://api.github.com")
      .post("/repos/YOUR_USERNAME/action-test/issues/18/comments", {
        body: "This message is added after 3 PRs are merged",
      })
      .reply(200);

    const addLabelMock = nock("https://api.github.com")
      .post("/repos/YOUR_USERNAME/action-test/issues/18/labels", {
        labels: ["merge-milestone", "merge-milestone:3"],
      })
      .reply(200);

    await action(tools);
  });
});

function mockEvent(name, mockPayload) {
  jest.mock(
    "/github/workspace/event.json",
    () => {
      return mockPayload;
    },
    {
      virtual: true,
    }
  );

  process.env.GITHUB_EVENT_NAME = name;
  process.env.GITHUB_EVENT_PATH = "/github/workspace/event.json";

  return new Toolkit();
}

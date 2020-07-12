const { Toolkit } = require("actions-toolkit");

// Run your GitHub Action!
Toolkit.run(async (tools) => {
  require("action-guard")("pull_request.closed");

  const payload = tools.context.payload;

  if (!payload.pull_request.merged) {
    tools.log.warn("Pull request closed without merge");
    return;
  }

  let pulls = await tools.github.paginate(
    tools.github.pulls.list,
    {
      ...tools.context.repo,
      state: "closed",
      per_page: 100,
    },
    (response) => response.data
  );

  const expectedAuthor = payload.pull_request.user.login;
  pulls = pulls.filter((p) => {
    if (!p.merged_at) {
      return false;
    }

    return p.user.login == expectedAuthor;
  });

  const pullCount = pulls.length;
  tools.log.debug(`There are ${pullCount} Pull Requests`);
});

const { Toolkit } = require("actions-toolkit");

Toolkit.run(async (tools) => {
  require("action-guard")("pull_request.closed");

  const payload = tools.context.payload;

  if (!payload.pull_request.merged) {
    tools.log.warn("Pull request closed without merge");
    return;
  }

  tools.log.pending(`Fetching pulls`);
  let pulls = await tools.github.paginate(
    tools.github.pulls.list,
    {
      ...tools.context.repo,
      state: "closed",
      per_page: 100,
    },
    (response) => response.data
  );
  tools.log.complete(`Fetched pulls`);

  const expectedAuthor = payload.pull_request.user.login;
  pulls = pulls.filter((p) => {
    if (!p.merged_at) {
      return false;
    }

    return p.user.login == expectedAuthor;
  });

  const pullCount = pulls.length;
  tools.log.debug(`There are ${pullCount} Pull Requests`);

  const message = tools.inputs[`merged_${pullCount}`];
  if (!message) {
    tools.log.info("No action required");
    return;
  }

  tools.log.pending(`Adding comment`);
  await tools.github.issues.createComment({
    ...tools.context.issue,
    body: message,
  });
  tools.log.complete(`Added comment: ${message}`);

  tools.log.pending(`Adding labels`);
  const labels = [`merge-milestone`, `merge-milestone:${pullCount}`];
  await tools.github.issues.addLabels({
    ...tools.context.issue,
    labels,
  });
  tools.log.complete(`Added labels:`, labels);
});

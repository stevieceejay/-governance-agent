import { connectGitHubCredentials } from "@vercel/connect/eve";
import { githubChannel } from "eve/channels/github";
import { handlePullRequest } from "../../scripts/pr-alert.mjs";

export default githubChannel({
  botName: "governance-agent",
  credentials: connectGitHubCredentials("github/governance-agent"),
  onComment: () => null,
  onPullRequest: async (ctx, pr) => {
    await handlePullRequest(ctx, pr);
    return null;
  }
});

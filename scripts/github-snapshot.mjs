import { checkApproval } from "./check-approval.mjs";

const projectOK = value => /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value);
const numberOK = value => Number.isSafeInteger(value) && value > 0;

async function getObject(api, path) {
  const response = await api.get(path);
  if (!response || !response.data || Array.isArray(response.data)) {
    throw new Error("Invalid GitHub object response: " + path);
  }
  return response.data;
}

async function getCollection(api, path, limit) {
  const items = [];
  for (let page = 1; page <= Math.ceil(limit / 100); page++) {
    const separator = path.includes("?") ? "&" : "?";
    const response = await api.get(path + separator + "per_page=100&page=" + page);
    if (!response || !Array.isArray(response.data)) {
      throw new Error("Invalid GitHub list response: " + path);
    }
    items.push(...response.data);
    if (items.length > limit) throw new Error("GitHub list exceeds safe limit: " + path);
    const link = response.headers?.get("link") || "";
    if (!/rel="next"/.test(link)) return items;
  }
  throw new Error("GitHub pagination limit reached: " + path);
}

export async function fetchTrustedSnapshot(api, { project, issueNumber, prNumber, now }) {
  if (!projectOK(project) || !numberOK(issueNumber) || !numberOK(prNumber)) {
    throw new Error("Invalid project or issue/PR number");
  }
  const root = "/repos/" + project;
  const repository = await getObject(api, root);
  if (repository.full_name !== project || !numberOK(repository.id)) {
    throw new Error("Repository identity mismatch");
  }
  const issue = await getObject(api, root + "/issues/" + issueNumber);
  if (issue.pull_request || typeof issue.body !== "string") {
    throw new Error("Proposal issue is missing or invalid");
  }
  const comments = await getCollection(api, root + "/issues/" + issueNumber + "/comments", 1000);
  const pr = await getObject(api, root + "/pulls/" + prNumber);
  if (pr.base?.repo?.id !== repository.id || typeof pr.base.sha !== "string" ||
      !Number.isSafeInteger(pr.changed_files) || pr.changed_files < 0 ||
      pr.changed_files >= 3000) {
    throw new Error("Pull request baseline or file count is incomplete");
  }
  const files = await getCollection(api, root + "/pulls/" + prNumber + "/files", 3000);
  if (files.length !== pr.changed_files) {
    throw new Error("Pull request file list is incomplete");
  }
  return {
    now,
    repository_id: repository.id,
    proposal_body: issue.body,
    comments: comments.map(comment => ({
      user_id: comment.user?.id,
      body: comment.body,
      created_at: comment.created_at,
      updated_at: comment.updated_at
    })),
    base_sha: pr.base.sha,
    actual_files: files.map(file => ({
      filename: file.filename,
      status: file.status,
      sha: file.sha,
      previous_filename: file.previous_filename
    }))
  };
}

export async function evaluatePullRequest(api, params) {
  try {
    return checkApproval(await fetchTrustedSnapshot(api, params));
  } catch (error) {
    return {
      state: "ATTENTION",
      findings: [{ code: "PROVIDER_EVIDENCE_INCOMPLETE", detail: String(error.message) }]
    };
  }
}

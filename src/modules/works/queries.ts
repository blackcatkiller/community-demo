import { branches, comments, versions, works } from "./mock-data";
import type { WorkType } from "./types";

export function getWorks(type?: WorkType) {
  return type ? works.filter((work) => work.type === type) : works;
}

export function getWork(workId: string) {
  return works.find((work) => work.id === workId);
}

export function getWorkBranches(workId: string) {
  return branches.filter((branch) => branch.workId === workId);
}

export function getWorkVersions(workId: string) {
  return versions.filter((version) => version.workId === workId);
}

export function getWorkVersion(workId: string, versionId: string) {
  return versions.find(
    (version) => version.workId === workId && version.id === versionId,
  );
}

export function getDefaultVersion(workId: string) {
  const work = getWork(workId);

  if (!work) {
    return undefined;
  }

  const defaultBranch = branches.find(
    (branch) => branch.id === work.defaultBranchId,
  );

  return versions.find((version) => version.id === defaultBranch?.headVersionId);
}

export function getWorkComments(workId: string) {
  return comments.filter((comment) => comment.workId === workId);
}

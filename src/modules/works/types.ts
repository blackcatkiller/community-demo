export type WorkType = "model" | "material";

export type UserSummary = {
  id: string;
  name: string;
  handle: string;
};

export type Work = {
  id: string;
  type: WorkType;
  title: string;
  description: string;
  owner: UserSummary;
  coverTone: string;
  rootVersionId: string;
  defaultBranchId: string;
  tags: string[];
  likeCount: number;
  favoriteCount: number;
  branchCount: number;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
};

export type WorkBranch = {
  id: string;
  workId: string;
  name: string;
  baseVersionId: string;
  headVersionId: string;
  owner: UserSummary;
  createdAt: string;
  updatedAt: string;
};

export type WorkVersion = {
  id: string;
  workId: string;
  branchId: string;
  parentVersionId: string | null;
  author: UserSummary;
  title: string;
  description: string;
  assetLabel: string;
  thumbnailTone: string;
  changeNote: string;
  createdAt: string;
};

export type WorkComment = {
  id: string;
  workId: string;
  versionId?: string;
  author: UserSummary;
  content: string;
  createdAt: string;
};

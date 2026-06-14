# Community Studio Plan

## Product Shape

Community Studio is a community platform for browsing, discussing, remixing, and editing 3D works. The main product loop is:

1. Browse models and materials.
2. Open a work detail page to preview the 3D asset, read comments, and inspect versions.
3. Edit a selected version and submit the result as a new branch/version.

The product should feel more like a collaborative creative repository than a static gallery. Each submitted work can be edited by multiple people, and each edit creates a new version branch instead of overwriting the original.

## Core Pages

### 1. Browse Page

Route:

```text
/
```

Purpose:

- Main discovery page.
- Masonry-style waterfall grid.
- Built-in category tabs for `Models` and `Materials`.
- Search and lightweight filters.

Primary sections:

- Top navigation.
- Search input.
- Category tabs:
  - Models
  - Materials
- Optional filters:
  - Popular
  - Latest
  - Editable
  - Following
- Masonry work cards.

Work card content:

- Cover image or generated 3D thumbnail.
- Work title.
- Author.
- Work type.
- Like count.
- Favorite count.
- Branch/version count.
- Tags.

Initial data can be mocked locally, but the UI should already reflect the future data model.

### 2. Work Detail Page

Route:

```text
/works/[workId]
```

Purpose:

- Show one work as a collaborative asset repository.
- Preview the selected model/material in a 3D viewer.
- Display comments, likes, favorites, and version history.
- Allow users to start editing from any version.

Primary sections:

- Header:
  - Work title.
  - Author.
  - Like button.
  - Favorite button.
  - Edit current version button.
- Main preview:
  - 3D viewer.
  - Orbit controls.
  - Current version indicator.
- Version panel:
  - Current branch.
  - Current version.
  - Version list.
  - Branch list.
  - Parent version reference.
- Work metadata:
  - Description.
  - Type: model or material.
  - Tags.
  - Created date.
  - Updated date.
- Discussion:
  - Comments.
  - Version-specific comments later.
  - Activity log later.

Important behavior:

- The detail page defaults to the main branch head version.
- Users can switch between versions.
- Users can click "Edit this version" to open the editor from that exact version.
- Editing should create a new branch or a new version on an existing user branch.

### 3. Editor Page

Route:

```text
/works/[workId]/versions/[versionId]/edit
```

Purpose:

- Full-screen 3D editing workspace.
- Loads a specific version as the base.
- Allows the user to modify the asset.
- Submitting creates a new version branch.

Primary layout:

- Top bar:
  - Back to detail.
  - Work name.
  - Base version.
  - Save draft.
  - Submit version.
- Left sidebar:
  - Tool buttons.
  - Object tree.
- Center:
  - 3D viewport.
  - Grid.
  - Camera controls.
  - Transform controls.
- Right sidebar:
  - Object properties.
  - Material properties.
  - Version metadata.
- Optional bottom area later:
  - Timeline.
  - History.
  - Commit message.

Initial editor tools:

- Select.
- Move.
- Rotate.
- Scale.
- Basic material color.
- Scene object selection.

Later editor tools:

- Import GLB/GLTF.
- Material presets.
- Undo/redo.
- Duplicate/delete object.
- Scene tree reorder.
- Lighting controls.
- Thumbnail generation.
- Draft autosave.

## Version And Branch Model

The versioning model should be designed like a lightweight GitHub-style collaboration flow.

Concepts:

- `Work`: the top-level creative asset, similar to a repository.
- `WorkBranch`: a named edit line for a work.
- `WorkVersion`: a submitted state of the asset.
- `parentVersionId`: connects one version to the version it was based on.
- `headVersionId`: points to the latest version on a branch.

Example:

```text
Work: Cyber Chair

main:
  v1 -> v2 -> v3

alice/soft-seat:
  based on v2 -> a1 -> a2

bob/material-test:
  based on v3 -> b1
```

Editing rule:

- Opening the editor from a version should not overwrite that version.
- Submitting edits creates a new `WorkVersion`.
- If the user has no active branch for that work, create a new `WorkBranch`.
- The new version points to the selected base version through `parentVersionId`.

## Suggested Data Model

```ts
type WorkType = "model" | "material";

type Work = {
  id: string;
  type: WorkType;
  title: string;
  description: string;
  ownerId: string;
  coverUrl: string;
  rootVersionId: string;
  defaultBranchId: string;
  tags: string[];
  likeCount: number;
  favoriteCount: number;
  branchCount: number;
  createdAt: string;
  updatedAt: string;
};

type WorkBranch = {
  id: string;
  workId: string;
  name: string;
  baseVersionId: string;
  headVersionId: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
};

type WorkVersion = {
  id: string;
  workId: string;
  branchId: string;
  parentVersionId: string | null;
  authorId: string;
  title: string;
  description: string;
  assetUrl: string;
  thumbnailUrl: string;
  changeNote: string;
  createdAt: string;
};

type Comment = {
  id: string;
  workId: string;
  versionId?: string;
  authorId: string;
  content: string;
  createdAt: string;
};

type Reaction = {
  id: string;
  workId: string;
  userId: string;
  type: "like" | "favorite";
  createdAt: string;
};
```

## Frontend Architecture

Suggested source structure:

```text
src/
  app/
    page.tsx
    works/
      [workId]/
        page.tsx
        versions/
          [versionId]/
            edit/
              page.tsx
  modules/
    works/
      components/
      data/
      types.ts
    editor/
      components/
      editor-shell.tsx
      editor-store.ts
      editor-viewport.tsx
  shared/
    components/
    utils/
```

Current tech stack:

- Next.js App Router.
- React.
- TypeScript.
- Tailwind CSS.
- Three.js.
- React Three Fiber.
- Drei.
- Zustand.

State ownership:

- Community/feed data should be fetched or mocked through feature-level data modules.
- Editor-only state should live in Zustand.
- High-frequency 3D transform state should stay close to the R3F scene where possible.
- Persisted versions should eventually be saved through server actions or API routes.

## Implementation Phases

### Phase 1: Static Product Skeleton

- Replace default home page with masonry browse layout.
- Add model/material tabs.
- Add mocked works.
- Add work detail route.
- Add reusable 3D viewer component.
- Add editor route under a work/version path.
- Reuse editor viewport from the current `/editor` prototype.

### Phase 2: Version-Aware Mock Flow

- Add mocked works, branches, and versions.
- Detail page can switch versions.
- Edit button links to selected version editor.
- Editor page displays base version info.
- Submit button creates a mocked new branch/version in local state or temporary mock action.

### Phase 3: Real Persistence

- Add authentication.
- Add database schema.
- Store works, branches, versions, comments, and reactions.
- Upload assets and thumbnails.
- Persist submitted versions.

### Phase 4: Collaboration Features

- Branch visualization.
- Activity feed.
- Version-specific comments.
- Fork/remix attribution.
- Merge or promote a branch to main.

### Phase 5: Editor Depth

- GLB/GLTF import.
- Material editing.
- Scene tree.
- Undo/redo.
- Draft autosave.
- Thumbnail capture.
- Asset validation.

## Open Decisions

- Should materials be standalone works, or should they also be attachable to model works?
- Should every edit always create a new branch, or can trusted owners commit to main?
- Should comments attach to the whole work first, or to specific versions from day one?
- Should the editor support only one model per work at first, or a full scene graph?
- Should the first backend use Prisma, Drizzle, or a lightweight file/mock layer?

## Recommended First Build Target

Build a fully navigable mocked prototype:

```text
/                         Browse works
/works/chair-001           Detail with 3D preview and version list
/works/chair-001/versions/v2/edit
                          Editor based on selected version
```

This gives the project the right long-term shape before real auth, database, and asset storage are added.

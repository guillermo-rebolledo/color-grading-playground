# Local projects and grade links

Use **Save project** to replace the current saved workspace on this browser and
origin. Save again after editing. Reload restores that snapshot automatically;
there is no autosave or project library. The graph, stable IDs, typed connections,
positions, parameters and colour settings are preserved. Selection, undo history,
viewer comparisons and GPU resources are session state.

IndexedDB database `color-grading-projects` version 1 contains the `projects`
store. Its `current` record holds `{ project, image }` in one atomic transaction.
`project` is `{ version: 1, graph, source }`; `graph` retains its own schema version.
`source` is null or `{ kind, id, name, encoding }`, where kind is `upload`, `sample`
or `chart`. Uploaded files are stored as their original bytes, then decoded again
through the existing precision-preserving image loader. Samples and charts use
stable references resolved against the bundled inventory, never supplied URLs.
The source encoding records the explicit input tag at save/share time. Restore
preserves all project encodings, including corrections to sample/chart tags.

Storage access, corrupt records, unsupported schema versions, quota failures and
missing/unreadable images have visible feedback. A failed write preserves the
previous snapshot. A missing source preserves the graph and its tags and asks
for a replacement image. Choosing a bundled sample/chart deliberately applies
that new source's encoding, just as in normal image loading. Uploaded replacements
retain the grade's input tag. No automatic migration or destructive recovery is
attempted; Save project can explicitly replace an unreadable record.

**Share grade** produces an lz-string compressed `#project=` URL fragment. Copy the
selectable field to share it. The link includes graph parameters and source
metadata (including the filename), but never the uploaded file. Links are local
artifacts: no POST, graph API or image upload is used. Recipients of uploaded
sources are prompted for their own still, even on a browser with another locally
saved project. Bundled sources can be resolved locally. A valid incoming link
takes precedence over local storage and is consumed from the address bar, so
future reloads restore the last explicitly saved workspace. Save to keep an
incoming grade on the recipient's device.

Limits are 16 KiB for the ASCII fragment, 262,144 decoded JSON characters, 128
nodes, 512 edges, parameter nesting depth 16 and arrays up to 4,096 entries. The
bounded lz-string-compatible decoder aborts while expanding, before collecting
more than the decoded limit. Graph/project validation runs before replacing the
workspace. Engine validation owns supported node types, numeric constraints,
enums and typed topology. Persistence copies node data generically, so additional
registered node parameters do not require their own serializers. Incomplete
work-in-progress graphs are retained in draft mode; evaluation still explains
missing required inputs. Unknown future schema versions and node types fail
visibly. Larger graphs remain editable but cannot be saved/shared until within
these limits; links have no guaranteed small size.

Browser workflow coverage is in `tests/projects.spec.ts`, including evaluated
preview equivalence, generic node-data round trips, same-tab links, corruption,
expansion bounds, storage faults, missing sources and network privacy.

import {
  GradingEngine,
  type GradingGraph,
  type Encoding,
} from "./engine/GradingEngine";

export type ProjectSource =
  | { kind: "upload"; id: string; name: string; encoding: Encoding }
  | { kind: "sample"; id: string; name: string; encoding: Encoding }
  | { kind: "chart"; id: string; name: string; encoding: Encoding };
export type Project = {
  version: 1;
  graph: GradingGraph;
  source: ProjectSource | null;
};
export const maxProjectLength = 256 * 1024;

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512;
}
// Limit nested generic parameters without coupling persistence to particular nodes.
function checkValue(value: unknown, depth = 0): void {
  if (depth > 16) throw new Error("Project parameters are nested too deeply.");
  if (typeof value === "number" && !Number.isFinite(value))
    throw new Error("Project parameters must be finite.");
  if (value === null || ["string", "number", "boolean"].includes(typeof value))
    return;
  if (Array.isArray(value)) {
    if (value.length > 4096)
      throw new Error("Project parameter array is too large.");
    value.forEach((item) => checkValue(item, depth + 1));
  } else if (record(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (["__proto__", "constructor", "prototype"].includes(key))
        throw new Error("Invalid project parameter key.");
      checkValue(item, depth + 1);
    }
  } else throw new Error("Invalid project parameters.");
}

export function parseProject(value: unknown): Project {
  if (!record(value)) throw new Error("Corrupt project data.");
  if (value.version !== 1)
    throw new Error(
      "Unsupported project schema version. Open it with a compatible app version.",
    );
  checkValue(value);
  if (JSON.stringify(value).length > maxProjectLength)
    throw new Error("Project data is too large (maximum 256 KiB).");
  const graph = value.graph;
  if (
    !record(graph) ||
    !Array.isArray(graph.nodes) ||
    !Array.isArray(graph.edges) ||
    graph.nodes.length > 128 ||
    graph.edges.length > 512
  )
    throw new Error("Invalid project graph (maximum 128 nodes and 512 edges).");
  for (const node of graph.nodes) {
    if (
      !record(node) ||
      !text(node.id) ||
      !text(node.type) ||
      !record(node.position) ||
      !record(node.data)
    )
      throw new Error("Invalid project node.");
  }
  for (const edge of graph.edges) {
    if (
      !record(edge) ||
      ![
        edge.id,
        edge.source,
        edge.target,
        edge.sourceHandle,
        edge.targetHandle,
      ].every(text)
    )
      throw new Error("Invalid project edge.");
  }
  // The public engine owns node registration, parameter, enum and graph semantics.
  const typedGraph = graph as GradingGraph;
  const error = GradingEngine.validate(typedGraph, true);
  if (error) throw new Error(`Invalid project: ${error}`);
  const source = value.source;
  if (source !== null) {
    if (
      !record(source) ||
      !["upload", "sample", "chart"].includes(String(source.kind)) ||
      !text(source.id) ||
      !text(source.name)
    )
      throw new Error("Invalid project source metadata.");
    const encodingError = GradingEngine.validate(
      {
        ...typedGraph,
        colour: { ...typedGraph.colour, input: source.encoding as Encoding },
      },
      true,
    );
    if (encodingError) throw new Error("Invalid source encoding metadata.");
  }
  return {
    version: 1,
    graph: {
      version: typedGraph.version,
      colour: structuredClone(typedGraph.colour),
      nodes: typedGraph.nodes.map(({ id, type, position, data }) => ({
        id,
        type,
        position: { x: position.x, y: position.y },
        data: structuredClone(data),
      })),
      edges: typedGraph.edges.map(
        ({ id, source, target, sourceHandle, targetHandle }) => ({
          id,
          source,
          target,
          sourceHandle,
          targetHandle,
        }),
      ),
    },
    source:
      source === null
        ? null
        : {
            kind: (source as ProjectSource).kind,
            id: (source as ProjectSource).id,
            name: (source as ProjectSource).name,
            encoding: structuredClone((source as ProjectSource).encoding),
          },
  };
}

function storageMessage(error: unknown) {
  return error instanceof DOMException && error.name === "QuotaExceededError"
    ? "Local storage is full. Free space and save again; your current grade is still open."
    : "Local storage is unavailable or could not be read. Your current grade is still open; try enabling browser storage.";
}
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    let expired = false;
    const timer = setTimeout(() => {
      expired = true;
      reject(
        new Error("Local storage is unavailable or blocked by another tab."),
      );
    }, 3000);
    try {
      request = indexedDB.open("color-grading-projects", 1);
    } catch (error) {
      clearTimeout(timer);
      reject(new Error(storageMessage(error)));
      return;
    }
    request.onupgradeneeded = () => {
      request.result.createObjectStore("projects");
    };
    request.onsuccess = () => {
      clearTimeout(timer);
      if (expired) request.result.close();
      else resolve(request.result);
    };
    request.onerror = () => {
      clearTimeout(timer);
      reject(new Error(storageMessage(request.error)));
    };
  });
}

export async function saveProject(
  project: Project,
  image: File | null,
): Promise<void> {
  const clean = parseProject(project);
  if (image && image.size > 50 * 1024 * 1024)
    throw new Error("Choose an image smaller than 50 MB.");
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      // One atomic record keeps the grade and its image from different saves from mixing.
      const transaction = db.transaction("projects", "readwrite");
      transaction.objectStore("projects").put(
        {
          project: clean,
          image: clean.source?.kind === "upload" ? image : null,
        },
        "current",
      );
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (error) {
    throw new Error(storageMessage(error));
  } finally {
    db.close();
  }
}

export async function restoreProject(): Promise<{
  project: Project;
  image: File | null;
} | null> {
  const db = await database();
  let saved: unknown;
  try {
    saved = await new Promise((resolve, reject) => {
      const transaction = db.transaction("projects", "readonly");
      const request = transaction.objectStore("projects").get("current");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    throw new Error(storageMessage(error));
  } finally {
    db.close();
  }
  if (saved === undefined) return null;
  if (!record(saved))
    throw new Error(
      "Corrupt saved project data. Save a new project to replace it.",
    );
  const project = parseProject(saved.project);
  const image =
    saved.image instanceof Blob &&
    saved.image.size <= 50 * 1024 * 1024 &&
    project.source?.kind === "upload"
      ? new File([saved.image], project.source.name, { type: saved.image.type })
      : null;
  return { project, image };
}

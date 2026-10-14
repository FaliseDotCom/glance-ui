// One Editor per process, configured from the environment (see docs/dev-environment.md).
import { env } from "node:process";
import { Editor } from "@glance-editor/server";

let editor: Promise<Editor> | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
let rotation: ReturnType<typeof setInterval> | undefined;

export function getEditor(): Promise<Editor> {
  editor ??= Editor.open({
    configPath: env.GLANCE_CONFIG ?? "/glance-config/glance.yml",
    dataDir: env.EDITOR_DATA_DIR ?? "/data",
    glanceUrl: env.GLANCE_URL || undefined,
    glanceBin: env.GLANCE_BIN || undefined,
    glanceVersion: env.GLANCE_VERSION ?? "unknown",
    previewConfigPath: env.PREVIEW_CONFIG || undefined,
    previewGlanceUrl: env.PREVIEW_GLANCE_URL || undefined,
    dockerUrl: env.DOCKER_PROXY_URL || undefined,
    assetsDir: env.ASSETS_DIR || undefined,
    glanceAssetsPath: env.GLANCE_ASSETS_PATH || undefined,
    pixabayApi: env.PIXABAY_API || undefined,
    serverFolders: (env.SERVER_FOLDERS ?? "").split(",").map((x) => x.trim()).filter(Boolean),
    // The icon finder's sources (ADR-0020); only tests change them.
    iconSources: {
      ...(env.ICON_CDN ? { cdn: env.ICON_CDN } : {}),
      ...(env.ICONIFY_API ? { iconify: env.ICONIFY_API } : {}),
      ...(env.OPENVERSE_API ? { openverse: env.OPENVERSE_API } : {}),
      ...(env.WIKIMEDIA_API ? { wikimedia: env.WIKIMEDIA_API } : {}),
    },
  }).then((e) => {
    // ADR-0008: a daily snapshot of the editor's data (retention handled in the store).
    timer ??= setInterval(() => e.dailyBackup(), 24 * 60 * 60 * 1000);
    timer.unref?.();
    // D-62: rotating Pixabay sets swap their current image on schedule (files only, no save).
    rotation ??= setInterval(() => void e.rotatePixabay().catch(() => undefined), 60 * 60 * 1000);
    rotation.unref?.();
    void e.rotatePixabay().catch(() => undefined);
    return e;
  });
  return editor;
}

/** JSON response helper; any thrown error becomes a 500 with its message. */
export async function json(fn: (e: Editor) => unknown, status = 200): Promise<Response> {
  try {
    return Response.json(await fn(await getEditor()), { status });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}

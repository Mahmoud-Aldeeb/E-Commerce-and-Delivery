// Runs a server-side loader and turns a failure into null, so one broken request
// shows an inline error instead of taking the whole page down
export async function safely<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (error) {
    console.error(
      "Server data load failed:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

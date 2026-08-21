export function mergeThreeWay(base: string, local: string, server: string): string {
  if (local === base) return server;
  if (server === base || local === server) return local;
  const localLines = local.split(/\r?\n/);
  const serverLines = server.split(/\r?\n/);
  const baseLines = base.split(/\r?\n/);
  const merged: string[] = [];
  const count = Math.max(baseLines.length, localLines.length, serverLines.length);
  for (let index = 0; index < count; index += 1) {
    const original = baseLines[index];
    const yours = localLines[index];
    const theirs = serverLines[index];
    if (yours === theirs) merged.push(yours ?? '');
    else if (yours === original) merged.push(theirs ?? '');
    else if (theirs === original) merged.push(yours ?? '');
    else {
      merged.push('<<<<<<< LOCAL', yours ?? '', '=======', theirs ?? '', '>>>>>>> SERVER');
    }
  }
  return merged.join('\n');
}

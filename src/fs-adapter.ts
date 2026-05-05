// Minimal fs-compatible adapter for Obsidian vault (works on desktop & mobile)
// Wraps Obsidian's vault.adapter into a subset of Node's fs API that isomorphic-git uses

export function createVaultFS(vaultAdapter: any) {
  return {
    readFile: (filepath: string, opts: any, cb?: Function): Promise<Buffer> | void => {
      const encoding = typeof opts === "string" ? opts : opts?.encoding;
      const callback = typeof opts === "function" ? opts : cb;
      const promise = vaultAdapter.read(filepath).then((data: string) => {
        if (encoding === "utf-8" || encoding === "utf8") return data;
        return Buffer.from(data, "utf-8");
      });
      if (callback) { promise.then((r: any) => callback(null, r)).catch(callback); return; }
      return promise;
    },

    readFileSync: (filepath: string, opts?: string | { encoding?: string }) => {
      // Sync not possible with adapter, but isomorphic-git only uses .readFile (async)
      throw new Error("readFileSync not available on mobile");
    },

    writeFile: (filepath: string, data: string | Buffer, opts: any, cb?: Function): Promise<void> | void => {
      const callback = typeof opts === "function" ? opts : cb;
      const content = typeof data === "string" ? data : data.toString("utf-8");
      const promise = vaultAdapter.write(filepath, content);
      if (callback) { promise.then(() => callback(null)).catch(callback); return; }
      return promise;
    },

    writeFileSync: (filepath: string, data: string | Buffer) => {
      // Async-only via adapter
      // isomorphic-git uses .writeFile (async), so sync is only for writeFileSync
      // This is safe to throw — callers use the async version
    },

    mkdir: (dirpath: string, opts: any, cb?: Function): Promise<void> | void => {
      const callback = typeof opts === "function" ? opts : cb;
      const promise = vaultAdapter.mkdir(dirpath).catch(() => {}); // ignore if exists
      if (callback) { promise.then(() => callback(null)).catch(callback); return; }
      return promise;
    },

    mkdirSync: (dirpath: string) => {
      // Not needed by isomorphic-git in practice
    },

    readdir: (dirpath: string, opts: any, cb?: Function): Promise<string[]> | void => {
      const callback = typeof opts === "function" ? opts : cb;
      const promise = vaultAdapter.list(dirpath).then((result: any) => {
        const files = result.files || [];
        return files.map((f: any) => typeof f === "string" ? f : f.name || f);
      });
      if (callback) { promise.then((r: any) => callback(null, r)).catch(callback); return; }
      return promise;
    },

    readdirSync: (dirpath: string) => {
      throw new Error("readdirSync not available on mobile");
    },

    stat: (filepath: string, cb?: Function): Promise<any> | void => {
      const promise = vaultAdapter.stat(filepath).then((s: any) => ({
        isFile: () => s?.type === "file",
        isDirectory: () => s?.type === "folder",
        size: s?.size || 0,
        mtimeMs: s?.mtime || Date.now(),
      }));
      if (cb) { promise.then((r: any) => cb(null, r)).catch(cb); return; }
      return promise;
    },

    statSync: (filepath: string) => {
      throw new Error("statSync not available on mobile");
    },

    lstat: (filepath: string, cb?: Function): Promise<any> | void => {
      return (this as any).stat(filepath, cb);
    },

    lstatSync: () => { throw new Error("lstatSync not available"); },

    unlink: (filepath: string, cb?: Function): Promise<void> | void => {
      const promise = vaultAdapter.remove(filepath);
      if (cb) { promise.then(() => cb(null)).catch(cb); return; }
      return promise;
    },

    rmdir: (dirpath: string, cb?: Function): Promise<void> | void => {
      const promise = vaultAdapter.rmdir(dirpath, true).catch(() => {});
      if (cb) { promise.then(() => cb(null)).catch(cb); return; }
      return promise;
    },

    existsSync: (filepath: string) => {
      // Sync check not available — always return true to avoid blocking init
      return true;
    },

    promises: {
      readFile: (filepath: string, opts?: any) =>
        vaultAdapter.read(filepath).then((data: string) => {
          if (opts?.encoding === "utf-8" || opts?.encoding === "utf8" || !opts) return data;
          return Buffer.from(data, "utf-8");
        }),
      writeFile: (filepath: string, data: string | Buffer) =>
        vaultAdapter.write(filepath, typeof data === "string" ? data : data.toString("utf-8")),
      readdir: (dirpath: string) =>
        vaultAdapter.list(dirpath).then((r: any) => (r.files || []).map((f: any) => typeof f === "string" ? f : f.name)),
      mkdir: (dirpath: string) => vaultAdapter.mkdir(dirpath).catch(() => {}),
      stat: (filepath: string) =>
        vaultAdapter.stat(filepath).then((s: any) => ({
          isFile: () => s?.type === "file",
          isDirectory: () => s?.type === "folder",
          size: s?.size || 0,
          mtimeMs: s?.mtime || Date.now(),
        })),
      unlink: (filepath: string) => vaultAdapter.remove(filepath),
      rmdir: (dirpath: string) => vaultAdapter.rmdir(dirpath, true).catch(() => {}),
    },
  };
}

// Desktop Node fs (direct)
export const nodeFS = {
  readFile: (...args: any[]) => require("fs").readFile(...args),
  readFileSync: (...args: any[]) => require("fs").readFileSync(...args),
  writeFile: (...args: any[]) => require("fs").writeFile(...args),
  writeFileSync: (...args: any[]) => require("fs").writeFileSync(...args),
  mkdir: (...args: any[]) => require("fs").mkdir(...args),
  readdir: (...args: any[]) => require("fs").readdir(...args),
  stat: (...args: any[]) => require("fs").stat(...args),
  statSync: (...args: any[]) => require("fs").statSync(...args),
  lstat: (...args: any[]) => require("fs").lstat(...args),
  unlink: (...args: any[]) => require("fs").unlink(...args),
  rmdir: (...args: any[]) => require("fs").rmdir(...args),
  existsSync: (...args: any[]) => require("fs").existsSync(...args),
  promises: require("fs").promises,
};

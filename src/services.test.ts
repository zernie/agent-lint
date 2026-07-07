/**
 * Experimental R3 disposable-service tier — unit + gated-integration suite.
 *
 * The pure command builders + the orchestration (over fakes) run everywhere; the
 * real-docker integration test skips when no daemon is reachable, mirroring the
 * bwrap/claude/codex-gated tests.
 */
import { describe, it, expect } from "vitest";
import { createServer, type AddressInfo } from "node:net";

import {
  experimental_startServices,
  experimental_withServices,
  type ContainerRuntime,
  type ServiceHandle,
  type ServiceSpec,
} from "./services.js";
import {
  containerNameFor,
  dockerRunArgs,
  dockerExecArgs,
  parseDockerPort,
  primaryPorts,
  makeDockerRuntime,
  type DockerExec,
} from "./services-docker.js";

/** A fake ServiceHandle with a fixed host:port for orchestration tests. */
function fakeHandle(port: number): ServiceHandle {
  return {
    host: "127.0.0.1",
    port,
    url: "",
    exec: () => ({ stdout: "", stderr: "", code: 0 }),
  };
}

describe("experimental_startServices (orchestration)", () => {
  it("starts each service, collects handles + endpoints, tears down", async () => {
    const started: string[] = [];
    const stopped: string[] = [];
    let port = 5000;
    const runtime: ContainerRuntime = {
      name: "fake",
      available: () => true,
      start: (name) => {
        started.push(name);
        const h = fakeHandle(port++);
        (h as { _n?: string })._n = name;
        return Promise.resolve(h);
      },
      stop: (h) => {
        stopped.push((h as { _n?: string })._n ?? "?");
        return Promise.resolve();
      },
    };

    const session = await experimental_startServices(
      { db: { image: "postgres:16" }, cache: { image: "redis:7" } },
      runtime,
    );

    expect(started).toEqual(["db", "cache"]);
    expect(Object.keys(session.handles)).toEqual(["db", "cache"]);
    expect(session.endpoints).toEqual(["127.0.0.1:5000", "127.0.0.1:5001"]);

    await session.teardown();
    expect(stopped).toEqual(["db", "cache"]);
  });

  it("a service that publishes no port contributes no endpoint", async () => {
    const runtime: ContainerRuntime = {
      name: "fake",
      available: () => true,
      // a portless service (e.g. a compute-only container): port is undefined
      start: () =>
        Promise.resolve({
          host: "127.0.0.1",
          exec: () => ({ stdout: "", stderr: "", code: 0 }),
        }),
      stop: () => Promise.resolve(),
    };
    const session = await experimental_startServices(
      { worker: { image: "busybox" } },
      runtime,
    );
    expect(session.handles.worker.port).toBeUndefined();
    expect(session.endpoints).toEqual([]); // nothing reachable to list
    await session.teardown();
  });

  it("tears down already-started services when a later one fails", async () => {
    const stopped: string[] = [];
    const runtime: ContainerRuntime = {
      name: "fake",
      available: () => true,
      start: (name) => {
        if (name === "bad") return Promise.reject(new Error("boom"));
        const h = fakeHandle(1);
        (h as { _n?: string })._n = name;
        return Promise.resolve(h);
      },
      stop: (h) => {
        stopped.push((h as { _n?: string })._n ?? "?");
        return Promise.resolve();
      },
    };

    await expect(
      experimental_startServices(
        { ok: { image: "a" }, bad: { image: "b" } },
        runtime,
      ),
    ).rejects.toThrow("boom");
    // the one that DID start must be cleaned up — no leaked container
    expect(stopped).toEqual(["ok"]);
  });

  it("withServices disposes the services even when fn throws", async () => {
    let stops = 0;
    const runtime: ContainerRuntime = {
      name: "fake",
      available: () => true,
      start: () => Promise.resolve(fakeHandle(1)),
      stop: () => {
        stops++;
        return Promise.resolve();
      },
    };
    await expect(
      experimental_withServices({ db: { image: "x" } }, runtime, () => {
        throw new Error("fn blew up");
      }),
    ).rejects.toThrow("fn blew up");
    expect(stops).toBe(1); // teardown ran despite the throw

    // and it returns fn's value on success
    const got = await experimental_withServices(
      { db: { image: "x" } },
      runtime,
      (s) => Promise.resolve(s.endpoints.length),
    );
    expect(got).toBe(1);
    expect(stops).toBe(2);
  });
});

describe("docker command builders (pure)", () => {
  it("sanitises + uniquifies the container name", () => {
    expect(containerNameFor("my/db name", "42-1")).toBe(
      "vigiles-my-db-name-42-1",
    );
    expect(containerNameFor("", "42-1")).toBe("vigiles-svc-42-1");
    expect(containerNameFor(".hidden", "9")).toBe("vigiles-hidden-9");
  });

  it("builds `docker run` with env + published ports", () => {
    const spec: ServiceSpec = {
      image: "postgres:16",
      env: { POSTGRES_PASSWORD: "test" },
      port: 5432,
    };
    expect(dockerRunArgs(spec, "vigiles-db-1")).toEqual([
      "run",
      "-d",
      "--rm",
      "--name",
      "vigiles-db-1",
      "-e",
      "POSTGRES_PASSWORD=test",
      "-p",
      "127.0.0.1::5432",
      "postgres:16",
    ]);
  });

  it("de-dupes the port list (primary first)", () => {
    expect(
      primaryPorts({ image: "x", port: 5432, ports: [5432, 9000] }),
    ).toEqual([5432, 9000]);
    expect(primaryPorts({ image: "x" })).toEqual([]);
  });

  it("builds `docker exec sh -c`", () => {
    expect(dockerExecArgs("c1", "pg_isready -U postgres")).toEqual([
      "exec",
      "c1",
      "sh",
      "-c",
      "pg_isready -U postgres",
    ]);
  });

  it("parses the published host port from `docker port`", () => {
    expect(parseDockerPort("0.0.0.0:49153")).toBe(49153);
    expect(parseDockerPort("127.0.0.1:49153\n[::]:49153")).toBe(49153);
    expect(parseDockerPort("")).toBeUndefined(); // "a port or nothing", not magic 0
  });
});

describe("makeDockerRuntime (over a fake docker CLI)", () => {
  /** A scriptable fake docker: maps the first arg → a canned result. */
  function fakeDocker(
    script: Partial<Record<string, { stdout?: string; code?: number }>>,
  ): {
    exec: DockerExec;
    calls: string[][];
  } {
    const calls: string[][] = [];
    const exec: DockerExec = (args) => {
      calls.push([...args]);
      const r = script[args[0]] ?? {};
      return { stdout: r.stdout ?? "", stderr: "", code: r.code ?? 0 };
    };
    return { exec, calls };
  }

  it("start: runs, discovers the port, polls ready (exec), seeds, returns a handle", async () => {
    let readyChecks = 0;
    const calls: string[][] = [];
    const exec: DockerExec = (args) => {
      calls.push([...args]);
      if (args[0] === "run") return { stdout: "cid\n", stderr: "", code: 0 };
      if (args[0] === "port")
        return { stdout: "0.0.0.0:49999", stderr: "", code: 0 };
      if (args[0] === "exec" && /pg_isready/.test(args[4] ?? "")) {
        // fail once, then succeed — proves the poll loop actually polls
        readyChecks++;
        return { stdout: "", stderr: "", code: readyChecks < 2 ? 1 : 0 };
      }
      return { stdout: "", stderr: "", code: 0 };
    };
    const runtime = makeDockerRuntime({
      exec,
      netProbe: () => Promise.resolve(true),
      sleep: () => Promise.resolve(),
    });

    const handle = await runtime.start("db", {
      image: "postgres:16",
      port: 5432,
      ready: { exec: "pg_isready -U postgres" },
      seed: "psql -f schema.sql",
    });

    expect(handle.host).toBe("127.0.0.1");
    expect(handle.port).toBe(49999);
    expect(readyChecks).toBe(2); // polled twice (failed then passed)
    // the run + a seed exec both happened
    expect(calls.some((c) => c[0] === "run")).toBe(true);
    expect(
      calls.some((c) => c[0] === "exec" && /psql -f schema/.test(c[4] ?? "")),
    ).toBe(true);

    // handle.exec routes through docker exec
    const out = handle.exec("select 1");
    expect(calls.at(-1)).toEqual([
      "exec",
      expect.stringContaining("vigiles-db-"),
      "sh",
      "-c",
      "select 1",
    ]);
    expect(out.code).toBe(0);
  });

  it("start: throws + cleans up when `docker run` fails", async () => {
    const { exec, calls } = fakeDocker({ run: { code: 1 } });
    const runtime = makeDockerRuntime({
      exec,
      netProbe: () => Promise.resolve(true),
    });
    await expect(runtime.start("db", { image: "bad" })).rejects.toThrow(
      /docker run failed/,
    );
    // no rm needed (nothing started) — but a run was attempted
    expect(calls[0][0]).toBe("run");
  });

  it("start: a failing seed throws AND removes the container", async () => {
    const calls: string[][] = [];
    const exec: DockerExec = (args) => {
      calls.push([...args]);
      if (args[0] === "run") return { stdout: "cid", stderr: "", code: 0 };
      if (args[0] === "exec") return { stdout: "", stderr: "nope", code: 1 }; // seed fails
      return { stdout: "", stderr: "", code: 0 };
    };
    const runtime = makeDockerRuntime({
      exec,
      netProbe: () => Promise.resolve(true),
      sleep: () => Promise.resolve(),
    });
    await expect(
      runtime.start("db", { image: "x", seed: "bad-seed" }),
    ).rejects.toThrow(/seed failed/);
    expect(calls.some((c) => c[0] === "rm" && c[1] === "-f")).toBe(true);
  });

  it("available() reflects `docker info`", () => {
    expect(
      makeDockerRuntime({
        exec: fakeDocker({ info: { code: 0 } }).exec,
      }).available(),
    ).toBe(true);
    expect(
      makeDockerRuntime({
        exec: fakeDocker({ info: { code: 1 } }).exec,
      }).available(),
    ).toBe(false);
  });

  it("readiness via a REAL tcp probe (exercises the default netProbe, no docker)", async () => {
    // A real listening socket the default netProbe connects to — covers the
    // real net.connect seam cross-platform, without a Docker daemon.
    const server = createServer();
    await new Promise<void>((r) =>
      server.listen(0, "127.0.0.1", () => {
        r();
      }),
    );
    const port = (server.address() as AddressInfo).port;
    try {
      const exec: DockerExec = (args) => {
        if (args[0] === "run") return { stdout: "cid", stderr: "", code: 0 };
        if (args[0] === "port")
          return { stdout: `0.0.0.0:${port}`, stderr: "", code: 0 };
        return { stdout: "", stderr: "", code: 0 };
      };
      // no netProbe injected → the REAL one runs against the live socket
      const runtime = makeDockerRuntime({
        exec,
        sleep: () => Promise.resolve(),
      });
      const handle = await runtime.start("svc", {
        image: "x",
        port: 5432,
        ready: { tcp: 5432 },
      });
      expect(handle.port).toBe(port); // reached readiness ⇒ start resolved
    } finally {
      await new Promise<void>((r) =>
        server.close(() => {
          r();
        }),
      );
    }
  });

  it("stop() removes the started container", async () => {
    const { exec, calls } = fakeDocker({
      run: { stdout: "cid" },
      port: { stdout: "0.0.0.0:1" },
    });
    const runtime = makeDockerRuntime({
      exec,
      netProbe: () => Promise.resolve(true),
      sleep: () => Promise.resolve(),
    });
    const h = await runtime.start("db", { image: "x", port: 5432 });
    await runtime.stop(h);
    expect(calls.some((c) => c[0] === "rm" && c[1] === "-f")).toBe(true);
  });

  it("stop() on a handle it never started is a no-op", async () => {
    const { exec, calls } = fakeDocker({});
    await makeDockerRuntime({ exec }).stop({
      host: "127.0.0.1",
      port: 1,
      url: "",
      exec: () => ({ stdout: "", stderr: "", code: 0 }),
    });
    expect(calls).toEqual([]); // no `rm` for an unknown handle
  });

  it("readiness via a log match (probeReady log branch)", async () => {
    let logChecks = 0;
    const exec: DockerExec = (args) => {
      if (args[0] === "run") return { stdout: "cid", stderr: "", code: 0 };
      if (args[0] === "port")
        return { stdout: "0.0.0.0:1", stderr: "", code: 0 };
      if (args[0] === "logs") {
        logChecks++;
        return {
          stdout: logChecks < 2 ? "booting" : "ready to accept connections",
          stderr: "",
          code: 0,
        };
      }
      return { stdout: "", stderr: "", code: 0 };
    };
    const runtime = makeDockerRuntime({ exec, sleep: () => Promise.resolve() });
    const h = await runtime.start("db", {
      image: "x",
      port: 5432,
      ready: { log: /ready to accept/ },
    });
    expect(h.port).toBe(1);
    expect(logChecks).toBe(2); // polled until the log matched
  });

  it("tcp readiness on a service with no published port throws", async () => {
    const exec: DockerExec = (args) =>
      args[0] === "run"
        ? { stdout: "cid", stderr: "", code: 0 }
        : { stdout: "", stderr: "", code: 0 };
    const runtime = makeDockerRuntime({ exec, sleep: () => Promise.resolve() });
    // no `port` declared, but ready:{tcp} — an illegal combo, surfaced explicitly
    await expect(
      runtime.start("db", { image: "x", ready: { tcp: 5432 } }),
    ).rejects.toThrow(/needs a published port/);
  });

  it("tcp readiness on a service with no published port throws", async () => {
    const exec: DockerExec = (args) =>
      args[0] === "run"
        ? { stdout: "cid", stderr: "", code: 0 }
        : { stdout: "", stderr: "", code: 0 };
    const runtime = makeDockerRuntime({ exec, sleep: () => Promise.resolve() });
    // no `port` declared, but ready:{tcp} — an illegal combo, surfaced explicitly
    await expect(
      runtime.start("db", { image: "x", ready: { tcp: 5432 } }),
    ).rejects.toThrow(/needs a published port/);
  });

  it("throws (and cleans up) when the service never becomes ready", async () => {
    const calls: string[][] = [];
    const exec: DockerExec = (args) => {
      calls.push([...args]);
      if (args[0] === "run") return { stdout: "cid", stderr: "", code: 0 };
      if (args[0] === "port")
        return { stdout: "0.0.0.0:1", stderr: "", code: 0 };
      return { stdout: "", stderr: "", code: 1 }; // ready-exec never passes
    };
    const runtime = makeDockerRuntime({
      exec,
      sleep: () => Promise.resolve(),
      readyTimeoutMs: 0, // fail fast — covers the timeout throw
    });
    await expect(
      runtime.start("db", { image: "x", port: 5432, ready: { exec: "false" } }),
    ).rejects.toThrow(/did not become ready/);
    expect(calls.some((c) => c[0] === "rm" && c[1] === "-f")).toBe(true);
  });
});

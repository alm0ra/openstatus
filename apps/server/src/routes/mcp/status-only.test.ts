import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Scope, Workspace } from "@openstatus/db/src/schema";
import { expect } from "@std/expect";
import { test } from "@std/testing/bdd";

import { createMcpServer } from "./server";

for (const scope of ["read", "write"] satisfies Scope[]) {
  test(`status-only MCP exposes only supported ${scope} tools`, async () => {
    // Discovery never reads workspace fields or touches the database.
    const workspace = { id: 1 } as Workspace;
    const server = createMcpServer(
      { workspace, actor: { type: "mcp", keyId: "test", scopes: [scope] } },
      { statusOnly: true },
    );
    const client = new Client({ name: "test", version: "1" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const { tools } = await client.listTools();
      const names = tools.map((tool) => tool.name).sort();
      const reads = [
        "list_status_pages",
        "list_page_components",
        "list_status_reports",
        "list_maintenances",
      ];
      const writes = [
        "create_status_report",
        "add_status_report_update",
        "update_status_report",
        "resolve_status_report",
        "create_maintenance",
      ];
      expect(names).toEqual(
        [...reads, ...(scope === "write" ? writes : [])].sort(),
      );
      if (scope === "read") {
        const result = await client.callTool({
          name: "create_status_report",
          arguments: {},
        });
        expect(result.isError).toBe(true);
      }
    } finally {
      await client.close();
      await server.close();
    }
  });
}

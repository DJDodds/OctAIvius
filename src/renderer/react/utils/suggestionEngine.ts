// Lightweight suggestion engine extracted for code-splitting.
// This module is only loaded when the user starts typing a slash command.

export type Suggestion = { label: string; insertText: string; detail?: string };

// Build a simple JSON template from a JSON schema
export const schemaToTemplate = (schema?: any): string => {
  if (!schema || typeof schema !== "object") return "{}";
  const props = schema.properties || {};
  const required: string[] = Array.isArray(schema.required)
    ? schema.required
    : [];
  const out: Record<string, any> = {};
  for (const key of Object.keys(props)) {
    const p = props[key] || {};
    if (required.includes(key) || required.length === 0) {
      const t = p.type;
      if (t === "number" || t === "integer") out[key] = 0;
      else if (t === "boolean") out[key] = false;
      else if (t === "array") out[key] = [];
      else if (t === "object") out[key] = {};
      else out[key] = "";
    }
  }
  try {
    const s = JSON.stringify(out);
    return s === "{}" ? "{}" : s;
  } catch {
    return "{}";
  }
};

export async function getSuggestions(
  text: string,
  ensureTools: (serverId: string) => Promise<any[]>
): Promise<Suggestion[]> {
  const trimmed = text.trimStart();
  const list: Suggestion[] = [];

  const baseCmds: Suggestion[] = [
    {
      label: "/mcp tools",
      insertText: "/mcp tools",
      detail: "List available MCP tools",
    },
    {
      label: "/mcp <tool> {args}",
      insertText: "/mcp ",
      detail: "Invoke MCP tool",
    },
    {
      label: "/clip <tool> {args}",
      insertText: "/clip ",
      detail: "Alias for /mcp",
    },
  ];

  if (!trimmed.startsWith("/")) return [];

  // If user typed only "/" or partial, suggest base commands + a few tools
  if (/^\/(?:m|mc|mcp|c|cl|cli|clip)?\s*$/i.test(trimmed)) {
    list.push(...baseCmds);
    const tools = await ensureTools("ampp");
    const top = tools.slice(0, 5);
    for (const t of top) {
      const tpl = schemaToTemplate(t.inputSchema);
      list.push({
        label: `/mcp ${t.name}`,
        insertText: `/mcp ${t.name} ${tpl}`,
        detail: t.description || "",
      });
    }
    return list;
  }

  // If typing a specific MCP/clip command
  const m = trimmed.match(/^\/(mcp|clip)\s+([^\s{]*)\s*({[\s\S]*)?$/i);
  if (m) {
    const serverId = "ampp";
    const partial = (m[2] || "").toLowerCase();
    const tools = await ensureTools(serverId);
    const filtered = tools
      .filter((t: any) => t.name.toLowerCase().startsWith(partial))
      .slice(0, 10);
    for (const t of filtered) {
      const tpl = schemaToTemplate(t.inputSchema);
      list.push({
        label: `/mcp ${t.name}`,
        insertText: `/mcp ${t.name} ${tpl}`,
        detail: t.description || "",
      });
    }
    if (!filtered.length && m[2]) {
      list.push({
        label: `Use: /mcp ${m[2]} {}`,
        insertText: `/mcp ${m[2]} {}`,
        detail: "Provide JSON arguments",
      });
    }
    return list;
  }

  return [];
}

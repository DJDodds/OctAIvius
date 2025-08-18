# MCP Usage Guide

This guide shows how to use the AMPP MCP Server from OctAIvius, with examples split into two groups:

- AMPP control tools (generic AMPP application control)
- ClipPlayer control tools (transport, load, markers)

You can invoke these via the MCP Panel (tools/call with JSON args) or ask in chat using natural language (OctAIvius will translate to tool calls).

## AMPP control tools

Discovery and workloads

- List applications
  { "tool": "ampp_list_application_types", "arguments": {} }
- List workloads for app
  { "tool": "ampp_list_workloads", "arguments": { "applicationType": "ClipPlayer" } }
- List workload names for app
  { "tool": "ampp_list_workload_names", "arguments": { "applicationType": "ClipPlayer" } }
- List all workloads (all apps)
  { "tool": "ampp_list_all_workloads", "arguments": {} }

Active workload per application

- Set active workload
  { "tool": "set_active_workload", "arguments": { "applicationType": "ClipPlayer", "workloadId": "your-workload-id" } }
- Get active workload
  { "tool": "get_active_workload", "arguments": { "applicationType": "ClipPlayer" } }

Schemas and commands

- Refresh latest schemas (all apps)
  { "tool": "ampp_refresh_application_schemas", "arguments": {} }
- List commands for app (names@version)
  { "tool": "ampp_list_commands_for_application", "arguments": { "applicationType": "ClipPlayer" } }
- List commands with summaries
  { "tool": "ampp_list_commands_for_application", "arguments": { "applicationType": "ClipPlayer", "includeSummary": true } }
- Show command schema
  { "tool": "ampp_show_command_schema", "arguments": { "applicationType": "ClipPlayer", "command": "play" } }
- Get command documentation
  { "tool": "ampp_get_command_doc", "arguments": { "applicationType": "ClipPlayer", "command": "play", "format": "markdown" } }

Validation and invocation

- Validate payload
  { "tool": "ampp_validate_payload", "arguments": { "applicationType": "ClipPlayer", "command": "controlstate", "payload": { "Index": 1, "Program": true } } }
- Suggest payload skeleton
  { "tool": "ampp_suggest_payload", "arguments": { "applicationType": "ClipPlayer", "command": "controlstate" } }
- Invoke command (with workload id)
  { "tool": "ampp_invoke", "arguments": { "applicationType": "ClipPlayer", "workloadId": "your-workload-id", "command": "controlstate", "payload": { "Index": 1, "Program": true } } }
- Invoke by workload name
  { "tool": "ampp_invoke_by_workload_name", "arguments": { "applicationType": "ClipPlayer", "workloadName": "Studio:ClipPlayer", "command": "controlstate", "payload": { "Index": 1, "Program": true } } }

Macros and examples

- List macros
  { "tool": "ampp_list_macros", "arguments": {} }
- Execute macro by name
  { "tool": "ampp_execute_macro_by_name", "arguments": { "name": "Start Show" } }
- List example prompts
  { "tool": "ampp_list_example_prompts", "arguments": {} }

Natural language equivalents

- "list all application types"
- "list workloads for ClipPlayer"
- "get the schemas for ClipPlayer" (auto refresh then list)
- "list the commands for ClipPlayer with summaries"
- "show the schema for ClipPlayer.play"
- "get command doc for ClipPlayer.play"
- "set active workload for ClipPlayer to 589c..."
- "invoke ClipPlayer.controlstate with { ... }"

## ClipPlayer control tools

Load content

- By file
  { "tool": "load_clip", "arguments": { "file": "S3://my-bucket/video.mp4" } }
- By clipId
  { "tool": "load_clip", "arguments": { "clipId": "01GSY8CK27A1AW12W8C1V66HJXC" } }

Transport

- Play/Pause toggle
  { "tool": "play_pause", "arguments": {} }
- Seek to frame
  { "tool": "seek", "arguments": { "frame": 1000 } }
- Set playback rate
  { "tool": "set_rate", "arguments": { "rate": 2.0 } }
- Shuttle (scrub)
  { "tool": "shuttle", "arguments": { "rate": -2.0 } }
- Transport state (play/pause + end behaviour)
  { "tool": "transport_state", "arguments": { "state": "play", "endBehaviour": "loop" } }
- Comprehensive transport command
  { "tool": "transport_command", "arguments": { "position": 100, "inPosition": 10, "outPosition": 200, "rate": 1.0, "endBehaviour": "loop" } }

Navigation and marks

- Go to start / end
  { "tool": "goto_start", "arguments": {} }
  { "tool": "goto_end", "arguments": {} }
- Step forward / back
  { "tool": "step_forward", "arguments": {} }
  { "tool": "step_back", "arguments": {} }
- Mark in / out
  { "tool": "mark_in", "arguments": {} }
  { "tool": "mark_out", "arguments": {} }

Quick transport and status

- Fast forward / Rewind
  { "tool": "fast_forward", "arguments": {} }
  { "tool": "rewind", "arguments": {} }
- Toggle loop
  { "tool": "loop", "arguments": {} }
- Get state / Clear assets
  { "tool": "get_state", "arguments": {} }
  { "tool": "clear_assets", "arguments": {} }

Natural language equivalents

- "load clip file S3://my-bucket/video.mp4"
- "load clip id 01GSY8CK27A1AW12W8C1V66HJXC"
- "play" / "pause" / "seek 1000" / "set rate 2" / "shuttle -2"
- "go to start" / "go to end" / "step forward" / "step back"
- "mark in" / "mark out" / "loop" / "get state" / "clear assets"

# Agent instructions (demo)

This file reads fine. Two of its references lie — `vigiles lint` catches both,
while the two truthful ones pass silently.

## Auth

Validate tokens with `vigiles:symbol src/auth.ts#verifyToken`.
Refresh sessions with `vigiles:symbol src/auth.ts#refreshSession`.

## Tools

Log via the helper MCP server with `vigiles:mcp helper#log`.
Clean up with `vigiles:mcp helper#purge_all`.

# StreamEngineProxy

`StreamEngineProxy` is a proxy helper for forwarding paid requests across downstream services.

## Purpose

- preserve payment context
- forward requests to downstream providers
- centralize retry / proof handling logic

The exported class is named `StreamEngineProxy` to match the rest of the active SDK surface.

# FlowPayProxy

`FlowPayProxy` is a proxy helper for forwarding paid requests across downstream services.

## Purpose

- preserve payment context
- forward requests to downstream providers
- centralize retry / proof handling logic

The exported class still keeps the older `FlowPayProxy` name for compatibility.

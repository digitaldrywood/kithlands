# Workflow Notes

Portable CI jobs run on the shared Linux self-hosted pool:

```yaml
runs-on: [self-hosted, linux, personal]
```

Do not add architecture labels such as `x64` or machine labels such as `prometheus` unless a job truly depends on that host or architecture. Keep production deploy jobs pinned only when the deployment target requires it. Avoid hardcoded host cache paths; let Go, npm, Playwright, and golangci-lint use each runner's normal user cache. If a widened job fails with exit 127, add an explicit setup step for the missing command or intentionally repin that job with a comment explaining why.

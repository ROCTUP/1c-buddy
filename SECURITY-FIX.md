# Security Fix for ROCTUP/1c-buddy

## Summary

This PR addresses 94 security finding(s) in this repository.

## Findings

### Container runs as root (no USER directive)

- **File:** `Dockerfile:23`
- **Severity:** HIGH
- **CWE:** [CWE-250](https://cwe.mitre.org/data/definitions/250.html)
- **Description:** The Dockerfile does not specify a non-root user. Containers running as root have elevated privileges and are a security risk.
- **Recommended Fix:** Add a non-root user:
```dockerfile
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser
```

### Long function: MCP (200 lines)

- **File:** `README_FULL.md:3`
- **Severity:** HIGH
- **CWE:** [CWE-1127](https://cwe.mitre.org/data/definitions/1127.html)
- **Description:** Function `MCP` is 200 lines long. Long functions are harder to understand and maintain.
- **Recommended Fix:** Extract helper functions or use early returns.

### Long function: Events (200 lines)

- **File:** `README_FULL.md:9`
- **Severity:** HIGH
- **CWE:** [CWE-1127](https://cwe.mitre.org/data/definitions/1127.html)
- **Description:** Function `Events` is 200 lines long. Long functions are harder to understand and maintain.
- **Recommended Fix:** Extract helper functions or use early returns.

### Long function: 1C (200 lines)

- **File:** `README_FULL.md:28`
- **Severity:** HIGH
- **CWE:** [CWE-1127](https://cwe.mitre.org/data/definitions/1127.html)
- **Description:** Function `1C` is 200 lines long. Long functions are harder to understand and maintain.
- **Recommended Fix:** Extract helper functions or use early returns.

### Long function: upstream (200 lines)

- **File:** `README_FULL.md:58`
- **Severity:** HIGH
- **CWE:** [CWE-1127](https://cwe.mitre.org/data/definitions/1127.html)
- **Description:** Function `upstream` is 200 lines long. Long functions are harder to understand and maintain.
- **Recommended Fix:** Extract helper functions or use early returns.

### Long function: MCP (200 lines)

- **File:** `README_FULL.md:131`
- **Severity:** HIGH
- **CWE:** [CWE-1127](https://cwe.mitre.org/data/definitions/1127.html)
- **Description:** Function `MCP` is 200 lines long. Long functions are harder to understand and maintain.
- **Recommended Fix:** Extract helper functions or use early returns.

### Long function: Windows (200 lines)

- **File:** `README_FULL.md:175`
- **Severity:** HIGH
- **CWE:** [CWE-1127](https://cwe.mitre.org/data/definitions/1127.html)
- **Description:** Function `Windows` is 200 lines long. Long functions are harder to understand and maintain.
- **Recommended Fix:** Extract helper functions or use early returns.

### Long function: Windows (200 lines)

- **File:** `README_FULL.md:197`
- **Severity:** HIGH
- **CWE:** [CWE-1127](https://cwe.mitre.org/data/definitions/1127.html)
- **Description:** Function `Windows` is 200 lines long. Long functions are harder to understand and maintain.
- **Recommended Fix:** Extract helper functions or use early returns.

### Long function: stdio (200 lines)

- **File:** `README_FULL.md:216`
- **Severity:** HIGH
- **CWE:** [CWE-1127](https://cwe.mitre.org/data/definitions/1127.html)
- **Description:** Function `stdio` is 200 lines long. Long functions are harder to understand and maintain.
- **Recommended Fix:** Extract helper functions or use early returns.

### Long function: Windows (200 lines)

- **File:** `README_FULL.md:218`
- **Severity:** HIGH
- **CWE:** [CWE-1127](https://cwe.mitre.org/data/definitions/1127.html)
- **Description:** Function `Windows` is 200 lines long. Long functions are harder to understand and maintain.
- **Recommended Fix:** Extract helper functions or use early returns.

### Long function: SetEnvironmentVariable (200 lines)

- **File:** `README_FULL.md:222`
- **Severity:** HIGH
- **CWE:** [CWE-1127](https://cwe.mitre.org/data/definitions/1127.html)
- **Description:** Function `SetEnvironmentVariable` is 200 lines long. Long functions are harder to understand and maintain.
- **Recommended Fix:** Extract helper functions or use early returns.

### Long function: upstream (138 lines)

- **File:** `README_FULL.md:348`
- **Severity:** HIGH
- **CWE:** [CWE-1127](https://cwe.mitre.org/data/definitions/1127.html)
- **Description:** Function `upstream` is 138 lines long. Long functions are harder to understand and maintain.
- **Recommended Fix:** Extract helper functions or use early returns.

### Long function: bundle (113 lines)

- **File:** `README_FULL.md:373`
- **Severity:** HIGH
- **CWE:** [CWE-1127](https://cwe.mitre.org/data/definitions/1127.html)
- **Description:** Function `bundle` is 113 lines long. Long functions are harder to understand and maintain.
- **Recommended Fix:** Extract helper functions or use early returns.

### Long function: CA (112 lines)

- **File:** `README_FULL.md:374`
- **Severity:** HIGH
- **CWE:** [CWE-1127](https://cwe.mitre.org/data/definitions/1127.html)
- **Description:** Function `CA` is 112 lines long. Long functions are harder to understand and maintain.
- **Recommended Fix:** Extract helper functions or use early returns.

### Container runs as root (no USER directive)

- **File:** `docker-compose.yml:14`
- **Severity:** HIGH
- **CWE:** [CWE-250](https://cwe.mitre.org/data/definitions/250.html)
- **Description:** The Dockerfile does not specify a non-root user. Containers running as root have elevated privileges and are a security risk.
- **Recommended Fix:** Add a non-root user:
```dockerfile
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser
```

### Restrictive license: GNU AGPLv3

- **File:** `pyproject.toml`
- **Severity:** HIGH
- **CWE:** [CWE-502](https://cwe.mitre.org/data/definitions/502.html)
- **Description:** The project uses GNU AGPLv3, which has copyleft requirements.
- **Recommended Fix:** Consider using a permissive license like MIT or Apache-2.0.

### GPL license detected

- **File:** `LICENSE`
- **Severity:** HIGH
- **CWE:** [CWE-502](https://cwe.mitre.org/data/definitions/502.html)
- **Description:** GPL requires derivative works to also be open source. This may affect proprietary use.
- **Recommended Fix:** Consider using a permissive license like MIT or Apache-2.0 if you want broader adoption.

### Long function: present (67 lines)

- **File:** `.env.example:2`
- **Severity:** MEDIUM
- **CWE:** [CWE-1127](https://cwe.mitre.org/data/definitions/1127.html)
- **Description:** Function `present` is 67 lines long. Long functions are harder to understand and maintain.
- **Recommended Fix:** Extract helper functions or use early returns.

### Long function: token (64 lines)

- **File:** `.env.example:5`
- **Severity:** MEDIUM
- **CWE:** [CWE-1127](https://cwe.mitre.org/data/definitions/1127.html)
- **Description:** Function `token` is 64 lines long. Long functions are harder to understand and maintain.
- **Recommended Fix:** Extract helper functions or use early returns.

### Generic Secret (CWE-798)

- **File:** `README.md:137`
- **Severity:** MEDIUM
- **CWE:** [CWE-798](https://cwe.mitre.org/data/definitions/798.html)
- **Description:** A potential Generic Secret was found in `README.md` at line 137. This could lead to unauthorized access if exposed.
- **Recommended Fix:** Remove the hardcoded secret and use environment variables or a secrets manager instead.

```diff
- api_key="your_custom_api_key"
+ # Use environment variable: process.env.GENERIC_SECRET
```

### Long function: 1C (95 lines)

- **File:** `README.md:31`
- **Severity:** MEDIUM
- **CWE:** [CWE-1127](https://cwe.mitre.org/data/definitions/1127.html)
- **Description:** Function `1C` is 95 lines long. Long functions are harder to understand and maintain.
- **Recommended Fix:** Extract helper functions or use early returns.

### Long function: Events (66 lines)

- **File:** `README.md:60`
- **Severity:** MEDIUM
- **CWE:** [CWE-1127](https://cwe.mitre.org/data/definitions/1127.html)
- **Description:** Function `Events` is 66 lines long. Long functions are harder to understand and maintain.
- **Recommended Fix:** Extract helper functions or use early returns.

### Long function: print (93 lines)

- **File:** `README.md:152`
- **Severity:** MEDIUM
- **CWE:** [CWE-1127](https://cwe.mitre.org/data/definitions/1127.html)
- **Description:** Function `print` is 93 lines long. Long functions are harder to understand and maintain.
- **Recommended Fix:** Extract helper functions or use early returns.

### Long function: SetEnvironmentVariable (57 lines)

- **File:** `README.md:188`
- **Severity:** MEDIUM
- **CWE:** [CWE-1127](https://cwe.mitre.org/data/definitions/1127.html)
- **Description:** Function `SetEnvironmentVariable` is 57 lines long. Long functions are harder to understand and maintain.
- **Recommended Fix:** Extract helper functions or use early returns.

### Generic Secret (CWE-798)

- **File:** `README_FULL.md:479`
- **Severity:** MEDIUM
- **CWE:** [CWE-798](https://cwe.mitre.org/data/definitions/798.html)
- **Description:** A potential Generic Secret was found in `README_FULL.md` at line 479. This could lead to unauthorized access if exposed.
- **Recommended Fix:** Remove the hardcoded secret and use environment variables or a secrets manager instead.

```diff
- api_key="your_gateway_key"
+ # Use environment variable: process.env.GENERIC_SECRET
```

### Long function: MCP (89 lines)

- **File:** `README_FULL.md:712`
- **Severity:** MEDIUM
- **CWE:** [CWE-1127](https://cwe.mitre.org/data/definitions/1127.html)
- **Description:** Function `MCP` is 89 lines long. Long functions are harder to understand and maintain.
- **Recommended Fix:** Extract helper functions or use early returns.

### Long function: MCP (68 lines)

- **File:** `README_FULL.md:733`
- **Severity:** MEDIUM
- **CWE:** [CWE-1127](https://cwe.mitre.org/data/definitions/1127.html)
- **Description:** Function `MCP` is 68 lines long. Long functions are harder to understand and maintain.
- **Recommended Fix:** Extract helper functions or use early returns.

### Hardcoded private IP: 192.168.0.1

- **File:** `README.md:97`
- **Severity:** LOW
- **CWE:** [CWE-200](https://cwe.mitre.org/data/definitions/200.html)
- **Description:** Hardcoded private IPs can cause issues when deploying to different environments.
- **Recommended Fix:** Use environment variables or configuration files:
```diff
- const host = '192.168.1.100'
+ const host = process.env.DB_HOST || 'localhost'
```

### Potentially broken link: chat_ui.png

- **File:** `README.md:42`
- **Severity:** LOW
- **CWE:** [CWE-200](https://cwe.mitre.org/data/definitions/200.html)
- **Description:** Link `chat_ui.png` may be broken. Verify the target exists.
- **Recommended Fix:** Verify the link target exists:
```markdown
[Интерфейс чата](./correct-path)
```

### Large file: 804 lines

- **File:** `README_FULL.md`
- **Severity:** LOW
- **CWE:** [CWE-1127](https://cwe.mitre.org/data/definitions/1127.html)
- **Description:** File has 804 lines. Large files are harder to navigate and maintain.
- **Recommended Fix:** Split into smaller, focused modules.

### No HEALTHCHECK instruction

- **File:** `docker-compose.yml:14`
- **Severity:** LOW
- **CWE:** [CWE-693](https://cwe.mitre.org/data/definitions/693.html)
- **Description:** Without HEALTHCHECK, orchestrators cannot determine if the container is healthy.
- **Recommended Fix:** Add a healthcheck:
```dockerfile
HEALTHCHECK --interval=30s --timeout=3s \
  CMD curl -f http://localhost:3000/health || exit 1
```

### Unpinned dependency: .[http]

- **File:** `requirements.txt`
- **Severity:** LOW
- **Description:** Package `.[http]` has no version constraint.
- **Recommended Fix:** Pin to a specific version:
```diff
- .[http]
+ .[http]==x.y.z
```

### Multiple blank lines

- **File:** `README.md:63`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Multiple consecutive blank lines reduce readability.
- **Recommended Fix:** Remove extra blank lines.

### Multiple blank lines

- **File:** `README.md:68`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Multiple consecutive blank lines reduce readability.
- **Recommended Fix:** Remove extra blank lines.

### Line exceeds 120 characters

- **File:** `README.md:73`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Line exceeds 120 characters

- **File:** `README.md:81`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Multiple blank lines

- **File:** `README.md:84`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Multiple consecutive blank lines reduce readability.
- **Recommended Fix:** Remove extra blank lines.

### Line exceeds 120 characters

- **File:** `README.md:88`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Line exceeds 120 characters

- **File:** `README.md:97`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Line exceeds 120 characters

- **File:** `README.md:110`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Multiple blank lines

- **File:** `README.md:155`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Multiple consecutive blank lines reduce readability.
- **Recommended Fix:** Remove extra blank lines.

### Line exceeds 120 characters

- **File:** `README.md:158`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Line exceeds 120 characters

- **File:** `README.md:178`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Line exceeds 120 characters

- **File:** `README.md:198`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Line exceeds 120 characters

- **File:** `README.md:205`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Line exceeds 120 characters

- **File:** `README.md:231`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Line exceeds 120 characters

- **File:** `README.md:233`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Multiple blank lines

- **File:** `README.md:239`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Multiple consecutive blank lines reduce readability.
- **Recommended Fix:** Remove extra blank lines.

### Line exceeds 120 characters

- **File:** `README.md:242`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Multiple blank lines

- **File:** `README.md:244`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Multiple consecutive blank lines reduce readability.
- **Recommended Fix:** Remove extra blank lines.

### Line exceeds 120 characters

- **File:** `README_FULL.md:3`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Line exceeds 120 characters

- **File:** `README_FULL.md:12`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Line exceeds 120 characters

- **File:** `README_FULL.md:17`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Multiple blank lines

- **File:** `README_FULL.md:75`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Multiple consecutive blank lines reduce readability.
- **Recommended Fix:** Remove extra blank lines.

### Line exceeds 120 characters

- **File:** `README_FULL.md:109`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Line exceeds 120 characters

- **File:** `README_FULL.md:118`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Line exceeds 120 characters

- **File:** `README_FULL.md:124`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Line exceeds 120 characters

- **File:** `README_FULL.md:136`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Line exceeds 120 characters

- **File:** `README_FULL.md:140`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Line exceeds 120 characters

- **File:** `README_FULL.md:143`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Line exceeds 120 characters

- **File:** `README_FULL.md:145`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Line exceeds 120 characters

- **File:** `README_FULL.md:152`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Line exceeds 120 characters

- **File:** `README_FULL.md:154`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Line exceeds 120 characters

- **File:** `README_FULL.md:156`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Line exceeds 120 characters

- **File:** `README_FULL.md:169`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Line exceeds 120 characters

- **File:** `README_FULL.md:187`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Line exceeds 120 characters

- **File:** `README_FULL.md:211`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Multiple blank lines

- **File:** `README_FULL.md:215`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Multiple consecutive blank lines reduce readability.
- **Recommended Fix:** Remove extra blank lines.

### Line exceeds 120 characters

- **File:** `README_FULL.md:234`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Line exceeds 120 characters

- **File:** `README_FULL.md:321`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Line exceeds 120 characters

- **File:** `README_FULL.md:364`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Line exceeds 120 characters

- **File:** `README_FULL.md:376`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Line exceeds 120 characters

- **File:** `README_FULL.md:384`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Line exceeds 120 characters

- **File:** `README_FULL.md:412`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Line exceeds 120 characters

- **File:** `README_FULL.md:417`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Line exceeds 120 characters

- **File:** `README_FULL.md:420`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Line exceeds 120 characters

- **File:** `README_FULL.md:434`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Line exceeds 120 characters

- **File:** `README_FULL.md:443`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Line exceeds 120 characters

- **File:** `README_FULL.md:460`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Line exceeds 120 characters

- **File:** `README_FULL.md:511`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Line exceeds 120 characters

- **File:** `README_FULL.md:512`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Line exceeds 120 characters

- **File:** `README_FULL.md:513`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Line exceeds 120 characters

- **File:** `README_FULL.md:539`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Line exceeds 120 characters

- **File:** `README_FULL.md:541`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Line exceeds 120 characters

- **File:** `README_FULL.md:586`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Line exceeds 120 characters

- **File:** `README_FULL.md:588`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Line exceeds 120 characters

- **File:** `README_FULL.md:590`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Line exceeds 120 characters

- **File:** `README_FULL.md:592`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Line exceeds 120 characters

- **File:** `README_FULL.md:619`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Line exceeds 120 characters

- **File:** `README_FULL.md:623`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Multiple blank lines

- **File:** `README_FULL.md:697`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Multiple consecutive blank lines reduce readability.
- **Recommended Fix:** Remove extra blank lines.

### Line exceeds 120 characters

- **File:** `README_FULL.md:743`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Long lines may be hard to read in some editors.
- **Recommended Fix:** Break long lines for better readability.

### Multiple blank lines

- **File:** `README_FULL.md:803`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Multiple consecutive blank lines reduce readability.
- **Recommended Fix:** Remove extra blank lines.

### Multiple blank lines

- **File:** `README_FULL.md:804`
- **Severity:** INFO
- **CWE:** [CWE-116](https://cwe.mitre.org/data/definitions/116.html)
- **Description:** Multiple consecutive blank lines reduce readability.
- **Recommended Fix:** Remove extra blank lines.

---

This fix was generated by an automated security scanner.
Please review the changes carefully before merging.
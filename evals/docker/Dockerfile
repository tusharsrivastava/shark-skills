FROM node:22-bookworm

ARG CLAUDE_CODE_VERSION=2.1.326
ARG MCP_DEBUGGER_VERSION=0.24.2
# code-health analyzers. Opengrep: the signed release binary (cosign-verified on 2026-11-21), never the PyPI name.
ARG OPENGREP_VERSION=v1.33.1
ARG OPENGREP_SHA256_X86=46e8133cc490f9f50518061590ce2f6be5a08afaeda034471c0ceda4b3899808
ARG OPENGREP_SHA256_AARCH64=d1433f63a90b8bc0b6ad4b498a13b372b856ce9a754a43484ba4920fe2d76dcf
ARG LIZARD_VERSION=1.25.0

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-pip git rsync bubblewrap socat ripgrep \
 && rm -rf /var/lib/apt/lists/* \
 && python3 -m pip install --quiet --break-system-packages pytest debugpy "lizard==${LIZARD_VERSION}" \
 && npm install -g "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" "@debugmcp/mcp-debugger@${MCP_DEBUGGER_VERSION}"

RUN arch="$(uname -m)" \
 && case "$arch" in x86_64) f=opengrep_manylinux_x86; sum="$OPENGREP_SHA256_X86";; aarch64) f=opengrep_manylinux_aarch64; sum="$OPENGREP_SHA256_AARCH64";; *) echo "no opengrep for $arch" >&2; exit 1;; esac \
 && curl -fsSL -o /usr/local/bin/opengrep "https://github.com/opengrep/opengrep/releases/download/${OPENGREP_VERSION}/$f" \
 && echo "$sum  /usr/local/bin/opengrep" | sha256sum -c - \
 && chmod 755 /usr/local/bin/opengrep

ENV npm_config_cache=/opt/npm-cache
RUN mkdir -p /opt/npm-cache && chown node:node /opt/npm-cache
USER node
RUN npx -y "@debugmcp/mcp-debugger@${MCP_DEBUGGER_VERSION}" --help >/dev/null 2>&1 || true
RUN git config --global --add safe.directory /work \
 && git config --global user.name eval \
 && git config --global user.email eval@example.com
WORKDIR /work

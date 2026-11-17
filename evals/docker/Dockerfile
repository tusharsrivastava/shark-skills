FROM node:22-bookworm

ARG CLAUDE_CODE_VERSION=2.1.326
ARG MCP_DEBUGGER_VERSION=0.24.2

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-pip git rsync bubblewrap socat ripgrep \
 && rm -rf /var/lib/apt/lists/* \
 && python3 -m pip install --quiet --break-system-packages pytest debugpy \
 && npm install -g "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" "@debugmcp/mcp-debugger@${MCP_DEBUGGER_VERSION}"

ENV npm_config_cache=/opt/npm-cache
RUN mkdir -p /opt/npm-cache && chown node:node /opt/npm-cache
USER node
RUN npx -y "@debugmcp/mcp-debugger@${MCP_DEBUGGER_VERSION}" --help >/dev/null 2>&1 || true
RUN git config --global --add safe.directory /work \
 && git config --global user.name eval \
 && git config --global user.email eval@example.com
WORKDIR /work

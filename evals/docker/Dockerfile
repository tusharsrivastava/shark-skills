FROM node:22-bookworm

ARG CLAUDE_CODE_VERSION=2.1.326

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-pip git rsync bubblewrap socat ripgrep \
 && rm -rf /var/lib/apt/lists/* \
 && python3 -m pip install --quiet --break-system-packages pytest debugpy \
 && npm install -g "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}"

USER node
RUN git config --global --add safe.directory /work \
 && git config --global user.name eval \
 && git config --global user.email eval@example.com
WORKDIR /work

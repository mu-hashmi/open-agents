FROM oven/bun:1.2.14-debian

ENV DEBIAN_FRONTEND=noninteractive
ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ENV AGENT_BROWSER_EXECUTABLE_PATH=/usr/bin/chromium

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    chromium \
    curl \
    git \
    jq \
    nodejs \
    npm \
    procps \
    ripgrep \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://code-server.dev/install.sh | sh -s -- --method=standalone --prefix=/usr/local
RUN npm install --global agent-browser

WORKDIR /home/daytona
ENTRYPOINT ["sleep", "infinity"]

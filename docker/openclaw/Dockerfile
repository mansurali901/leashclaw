FROM openclaw/openclaw:latest

USER root

# Install tini entrypoint helper (already in base image) + jq for config generation
RUN apt-get update && apt-get install -y --no-install-recommends jq && rm -rf /var/lib/apt/lists/*

# Create the openclaw config + extensions directories
RUN mkdir -p /home/node/.openclaw/extensions/guardrail-enforcement \
    && chown -R node:node /home/node/.openclaw

# Copy the guardrail enforcement plugin
COPY plugin/ /home/node/.openclaw/extensions/guardrail-enforcement/

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER node

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "openclaw.mjs", "gateway"]

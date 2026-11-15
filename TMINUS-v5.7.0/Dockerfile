FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=npm_ca if [ -f /run/secrets/npm_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca; fi; npm ci --omit=dev --omit=optional && npm cache clean --force
COPY dist ./dist
COPY server ./server
COPY build.mjs ./build.mjs
RUN chmod -R a+rX /app/dist /app/server && chmod a+r /app/package*.json /app/build.mjs && mkdir -p /app/data && chown -R node:node /app/data
USER node
ENV HOST=0.0.0.0 PORT=8095 DATA_DIR=/app/data
EXPOSE 8095
CMD ["node", "server/start.mjs"]

# No runtime dependencies, so there's nothing to install. Node runs the
# TypeScript directly.
FROM node:24-alpine
WORKDIR /app
COPY apps/payment-sim/src src
COPY apps/payment-sim/package.json .
EXPOSE 4100
CMD ["node", "--watch", "src/server.ts"]

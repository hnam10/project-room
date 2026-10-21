# One image serves the API and the built web app. SurrealDB runs embedded and keeps its files in /data:
# mount a persistent volume there, or the database resets on every deploy.
#
#   docker build --build-arg VITE_CLERK_PUBLISHABLE_KEY=pk_... -t project-room .
#   docker run -p 4000:4000 -v project-room-data:/data --env-file apps/api/.env project-room
FROM node:22-slim
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci

COPY . .
# The Clerk publishable key is public by design but Vite bakes it in at build time.
ARG VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY
RUN npm run build

ENV NODE_ENV=production \
    PORT=4000 \
    SURREAL_URL=surrealkv:///data/project-room.db
VOLUME /data
EXPOSE 4000
WORKDIR /app/apps/api
CMD ["node", "dist/index.js"]

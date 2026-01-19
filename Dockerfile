# syntax=docker/dockerfile:1
FROM node:20-alpine AS base

WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install --production=false
COPY src ./src
COPY *.traineddata ./
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=base /app/dist ./dist
COPY --from=base /app/dist ./dist
COPY --from=base /app/package.json ./package.json

# CRITICAL: Install dependencies for Image Processing (Sharp/Canvas)
RUN apk add --no-cache graphicsmagick libc6-compat

# CRITICAL: Copy OCR training data
COPY --from=base /app/eng.traineddata ./eng.traineddata
COPY --from=base /app/fra.traineddata ./fra.traineddata
RUN npm install --omit=dev && mkdir -p /app/models
EXPOSE 8080
CMD ["node", "dist/index.js"]
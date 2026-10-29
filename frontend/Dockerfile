# Dev image for the Vite dev server (used by docker-compose).
FROM node:22-alpine
WORKDIR /app/frontend
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
CMD ["npm", "run", "dev", "--", "--host", "--port", "5173"]
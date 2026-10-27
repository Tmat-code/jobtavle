# Bygger med Dockers klassiske motor (ingen buildx/BuildKit noedvendig).
FROM node:20-alpine

WORKDIR /app

# Installer afhaengigheder foerst (udnytter cache).
COPY package.json ./
RUN npm install --omit=dev

# Kopiér resten af appen.
COPY . .

EXPOSE 3000

CMD ["node", "server.js"]

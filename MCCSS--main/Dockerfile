FROM node:18-alpine
WORKDIR /app
COPY MCCSS--main /app
RUN npm ci --production --prefix ./Edenfield-main
WORKDIR /app/Edenfield-main
EXPOSE 3000
CMD ["node", "../server.js"]

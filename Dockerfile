FROM oven/bun:latest
WORKDIR /app

# Copy package files and install dependencies
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Copy the entire application code
COPY . .

# Expose the port (MentraOS default: 3000)
EXPOSE 3000

CMD ["bun", "src/index.ts"]

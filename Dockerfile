# ── Stage 1: Build ──────────────────────────────────────────────
FROM oven/bun:1 AS builder

WORKDIR /app

# Build-time env vars for Vite (baked into the client JS bundle at build time)
# These are public anon/publishable keys — safe to include in Dockerfile
ENV VITE_SUPABASE_URL=https://lepbljtyhscjcaoveiom.supabase.co
ENV VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxlcGJsanR5aHNjamNhb3ZlaW9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0NDYzOTAsImV4cCI6MjA5NjAyMjM5MH0.WM6PH7qGlduj9nynFfKqnraUJERZxtBf9b8IauzUFz0
ENV VITE_SUPABASE_PROJECT_ID=lepbljtyhscjcaoveiom

# Copy dependency files first (layer cache)
COPY package.json bun.lock ./

RUN bun install

# Copy source
COPY . .

# Build SPA (outputs to dist/client/ with _shell.html)
RUN bun run build

# ── Stage 2: Production (nginx static server) ────────────────────
FROM nginx:alpine AS runner

# Copy built static files
COPY --from=builder /app/dist/client /usr/share/nginx/html

# nginx config: serve SPA with fallback to _shell.html for all routes
RUN printf 'server {\n\
    listen 8080;\n\
    root /usr/share/nginx/html;\n\
    index _shell.html;\n\
    location / {\n\
        try_files $uri $uri/ /_shell.html;\n\
    }\n\
    gzip on;\n\
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;\n\
}\n' > /etc/nginx/conf.d/default.conf

# Cloud Run uses PORT env var (default 8080)
EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]

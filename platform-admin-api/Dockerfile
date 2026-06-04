FROM denoland/deno:alpine-2.0.6

WORKDIR /app
COPY src ./src

# Pre-cache dependencies so the first request doesn't pay the import cost
RUN deno cache --allow-import src/main.ts

EXPOSE 8080
ENV PORT=8080

# --allow-net for postgres + outbound (none needed actually but pg client uses it)
# --allow-env for reading PLATFORM_ADMIN_DB_URL and friends
CMD ["deno", "run", "--allow-net", "--allow-env", "--allow-import", "src/main.ts"]

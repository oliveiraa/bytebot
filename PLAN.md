# Plan: Enhanced Development Lifecycle

**Objective:** Create a fast, efficient, and productive local development environment that mirrors the production setup while allowing for hot-reloading of code changes without requiring constant Docker image rebuilds.

---

## Phase 1: Environment-Specific Compose Files

**Goal:** Separate the Docker Compose configuration into a base file and environment-specific overrides. This is the foundation for a flexible setup.

1.  **Analyze `docker-compose.yml`:** Deeply analyze the existing `infrastructure/docker/docker-compose.yml` to understand all services, networks, and dependencies.
2.  **Create `docker-compose.base.yml`:** Create a new `docker-compose.base.yml` file that contains the common configuration for all services (`ui`, `agent`, `desktop`, `postgres`) that is shared between *all* environments (development and production). This includes service definitions, networks, and basic environment variables.
3.  **Create `docker-compose.dev.yml`:** Create a new `docker-compose.dev.yml` file. This file will *override* and *extend* the base configuration specifically for development. Its key responsibilities will be:
    *   **Volume Mounts:** Define volumes to mount the local source code from `packages/*` into the corresponding containers (e.g., `packages/bytebot-ui` into the `ui` container).
    *   **Development Commands:** Override the default `command` for services to run them in development/watch mode (e.g., `npm run dev` instead of `npm start`).
    *   **Exposing Ports:** Ensure all necessary ports are mapped to the host for direct access and debugging.
4.  **Modify `docker-compose.yml` for Production:** The existing `docker-compose.yml` will be simplified to become the *production* configuration. It will use the pre-built images from Docker Hub or a registry and will not have any local volume mounts. It will be designed for deployment.
5.  **Update Documentation:** Modify the `README.md` and other relevant documentation to explain the new development workflow (`docker-compose -f docker-compose.base.yml -f docker-compose.dev.yml up`) versus the production workflow.

## Phase 2: Dockerfile Optimization

**Goal:** Ensure the Dockerfiles are optimized for both development (leveraging local mounts) and production (creating efficient, self-contained images).

1.  **Analyze Dockerfiles:** Review the `Dockerfile` for each service (`agent`, `ui`, `desktop`).
2.  **Multi-Stage Builds:** Ensure the Dockerfiles use multi-stage builds. This allows us to have a larger build environment with all the development dependencies, but a smaller, leaner production image with only the necessary artifacts.
3.  **Development Stage:** The development setup with `docker-compose.dev.yml` will likely only use the base image and then mount the code, bypassing the later stages of the Dockerfile. The production build will execute all stages.

## Phase 3: Tooling & Scripts (Optional but Recommended)

**Goal:** Simplify the developer experience with helper scripts.

1.  **Create `package.json` scripts:** Add scripts to the root `package.json` to abstract the long `docker-compose` commands. For example:
    *   `"dev": "docker-compose -f infrastructure/docker/docker-compose.base.yml -f infrastructure/docker/docker-compose.dev.yml up"`
    *   `"build": "docker-compose -f infrastructure/docker/docker-compose.yml build"`
    *   `"start": "docker-compose -f infrastructure/docker/docker-compose.yml up -d"`
2.  **Environment File Handling:** Improve the management of `.env` files, perhaps with a clear `.env.example` and instructions for creating `.env.development` and `.env.production`.

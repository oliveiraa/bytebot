# Tasks: Enhanced Development Lifecycle

This file breaks down the work required to implement the new development lifecycle as outlined in `PLAN.md`.

---

## Phase 1: Environment-Specific Compose Files

**Objective:** Refactor the Docker Compose setup to support a hot-reloading development environment alongside the existing production environment.

- [ ] **Task 1.1: Analyze Existing `docker-compose.yml`**
    - [ ] Read and fully understand the services, networks, volumes, and dependencies in `infrastructure/docker/docker-compose.yml`.
    - [ ] Identify which configurations are universal (base) and which are specific to the current production-like setup.

- [ ] **Task 1.2: Create `docker-compose.base.yml`**
    - [ ] Create a new file: `infrastructure/docker/docker-compose.base.yml`.
    - [ ] Move the core, environment-agnostic service definitions from `docker-compose.yml` into this new base file. This includes:
        - Service names (`ui`, `agent`, `desktop`, `postgres`).
        - Network definitions.
        - Basic dependencies (`depends_on`).
        - `env_file` declarations.

- [ ] **Task 1.3: Create `docker-compose.dev.yml` for Development**
    - [ ] Create a new file: `infrastructure/docker/docker-compose.dev.yml`.
    - [ ] This file should extend the `docker-compose.base.yml`.
    - [ ] For the `ui`, `agent`, and `bytebotd` services, add `volumes` to mount local source code. Example for the agent:
      ```yaml
      services:
        agent:
          volumes:
            - ../../packages/bytebot-agent:/usr/src/app
            - /usr/src/app/node_modules
      ```
    - [ ] For each service, override the `command` to use a development-focused, hot-reloading script (e.g., `npm run dev`).
    - [ ] Ensure all necessary service ports (9990, 9991, 9992) are mapped to `localhost` for easy access.

- [ ] **Task 1.4: Refactor `docker-compose.yml` for Production**
    - [ ] Modify the existing `infrastructure/docker/docker-compose.yml` to be the definitive production/deployment configuration.
    - [ ] It should extend `docker-compose.base.yml`.
    - [ ] It should *not* contain any local volume mounts for source code.
    - [ ] It should use the final `command` for running the compiled application (e.g., `npm start`).
    - [ ] It should reference pre-built images (if applicable) or build the production stage of the Dockerfiles.

- [ ] **Task 1.5: Update Documentation**
    - [ ] Modify `README.md` to reflect the new development process.
    - [ ] Add a "Development" section explaining how to run the new local environment (e.g., `docker-compose -f ... up`).
    - [ ] Clearly distinguish this from the existing "Quick Start" instructions, which should be framed for a production-like deployment.

"""Background workers (RQ + Redis).

Each public function in `workers.jobs` is enqueueable from the API layer
and runs inside the `rq worker` process started by `make worker`. Jobs
must be importable both from the API process (for enqueueing) and from
the worker process (for execution), so we keep them as plain functions
with simple-typed arguments — no FastAPI imports, no request-scoped
state.
"""

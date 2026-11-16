"""ASP curriculum planner package.

The Python layers are intentionally small and named by role:

``data``         input dataclasses, JSON loaders, and validation
``translation``  dataset and student records to ASP facts
``engine``       clingo execution and typed plan extraction
``cli``          rendering and the command-line entry point
"""

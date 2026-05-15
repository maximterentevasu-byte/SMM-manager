"""Celery tasks for AI image generation (async work moved off the HTTP request lifecycle)."""
import asyncio
from app.workers.celery_app import celery_app


@celery_app.task(name="app.workers.image_tasks.generate_image_task", queue="generation")
def generate_image_task(prompt: str, aspect_ratio: str = "1:1") -> dict:
    from app.services.gemini_image import generate_image
    try:
        result = asyncio.run(generate_image(prompt, aspect_ratio))
        return {"status": "done", "image_base64": result}
    except Exception as e:
        return {"status": "error", "error": str(e)}

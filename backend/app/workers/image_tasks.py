"""Celery tasks for AI image generation/editing (async work off the HTTP request lifecycle)."""
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


@celery_app.task(name="app.workers.image_tasks.edit_image_task", queue="generation")
def edit_image_task(base_image: dict, reference_images: list, instruction: str) -> dict:
    from app.services.gemini_image import edit_image
    try:
        result = asyncio.run(edit_image(base_image, reference_images, instruction))
        return {"status": "done", "image_base64": result}
    except Exception as e:
        return {"status": "error", "error": str(e)}

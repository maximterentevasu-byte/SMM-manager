"""
Модуль рыночной аналитики для AI-промптов.
Использует знания Claude о трендах, вирусных форматах и паттернах по нише.
Результат кешируется в памяти на 24ч — вызов идёт один раз за генерацию стратегии.
"""
import logging
import time
import anthropic
from app.config import settings

log = logging.getLogger(__name__)
MODEL = "claude-sonnet-4-6"

_cache: dict[str, tuple[str, float]] = {}
_CACHE_TTL = 86400  # 24 часа


def _cache_key(profile: dict) -> str:
    niche = (profile.get("niche") or "").strip().lower()[:80]
    platforms = ",".join(sorted(profile.get("platforms") or []))
    audience = (profile.get("audience_primary") or "").strip().lower()[:60]
    return f"{niche}|{platforms}|{audience}"


async def get_market_insights(business_profile: dict) -> str:
    """
    Возвращает текст с рыночными инсайтами для ниши бизнеса.
    Использует встроенные знания Claude о трендах и вирусных паттернах.
    При ошибке возвращает пустую строку (не блокирует генерацию контента).
    """
    key = _cache_key(business_profile)
    if key in _cache:
        result, ts = _cache[key]
        if time.time() - ts < _CACHE_TTL:
            return result

    niche = business_profile.get("niche") or "малый бизнес"
    audience = business_profile.get("audience_primary") or "широкая аудитория"
    platforms = ", ".join(business_profile.get("platforms") or ["vk"])
    brand_voice = business_profile.get("brand_voice") or ""
    usp = business_profile.get("usp") or ""
    geo = business_profile.get("address") or "Россия"

    prompt = f"""Ты ведущий SMM-аналитик российского рынка. Проанализируй нишу и дай конкретные рыночные инсайты.

ПАРАМЕТРЫ БИЗНЕСА:
- Ниша: {niche}
- Целевая аудитория: {audience}
- Платформы: {platforms}
- Голос бренда: {brand_voice}
- УТП: {usp}
- Гео: {geo}

ЗАДАЧА: Дай структурированный анализ рынка для настройки контент-стратегии. Опирайся на реальные паттерны SMM в России.

Ответь строго в этом формате (без markdown, без JSON — просто текст с заголовками):

ВИРУСНЫЕ ФОРМАТЫ ДЛЯ НИШИ:
[3-4 формата постов, которые стабильно дают высокий ER в нише {niche} на {platforms}. Конкретно: формат, почему работает, пример начала]

ГОРЯЧИЕ ТЕМЫ И ТРЕНДЫ:
[3-4 актуальные темы/события/инфоповода, которые интересны аудитории {audience} в нише {niche} прямо сейчас]

ВИРУСНЫЕ ИДЕИ ДЛЯ КОНТЕНТА:
[5 конкретных идей постов с высоким потенциалом вирусности для {niche}. Каждая идея — одно предложение]

ЛУЧШИЕ ХУКИ И ЗАХОДЫ:
[4-5 работающих первых фраз / заходов к постам, типичных для успешного контента в {niche}]

ОШИБКИ И АНТИПАТТЕРНЫ:
[3 типичные ошибки SMM в нише {niche}, которых надо избегать, и почему аудитория их отвергает]

КОНКУРЕНТНЫЕ ПАТТЕРНЫ:
[Что делают успешные аккаунты в {niche} в России: частота, форматы, подача, вовлекающие механики]"""

    try:
        cl = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        resp = cl.messages.create(
            model=MODEL,
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}],
        )
        result = resp.content[0].text.strip()
        _cache[key] = (result, time.time())
        return result
    except Exception as e:
        log.warning("[market_research] failed to get market insights: %s", e)
        return ""


def format_market_insights_for_prompt(insights: str) -> str:
    """Оборачивает инсайты в блок для промпта."""
    if not insights:
        return ""
    return (
        "═══ РЫНОЧНЫЕ ИНСАЙТЫ (данные по нише — используй для генерации контента) ═══\n"
        + insights
        + "\n═══════════════════════════════════════════════════════════════════════"
    )
